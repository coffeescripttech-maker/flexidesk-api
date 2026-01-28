// src/controllers/bookings.controller.js
const axios = require("axios");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");
const User = require("../models/User");
const Case = require("../models/Case");
const { generateQrToken } = require("../utils/qrToken");
const { sendBookingConfirmationEmail } = require("../utils/mailer");

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const APP_URL = process.env.APP_URL || "http://localhost:5173";

const uid = (req) => req.user?._id || req.user?.id || req.user?.uid || null;
const isAdmin = (req) => String(req.user?.role || "").toLowerCase() === "admin";

function pickListing(l) {
  if (!l) return null;
  const { _id, title, venue, city, country, photosMeta = [], coverIndex = 0 } = l;
  
  // Extract image URLs from photosMeta
  // photosMeta can have objects with url, path, or be plain strings
  const images = photosMeta
    .map(photo => {
      if (typeof photo === 'string') return photo;
      return photo?.url || photo?.path || null;
    })
    .filter(Boolean);
  
  const cover = images[coverIndex] || images[0] || null;
  
  return { _id, title, venue, city, country, images, cover };
}

async function attachListings(rows) {
  const ids = [
    ...new Set(
      rows
        .map((b) => String(b.listingId || ""))
        .filter((v) => !!v && mongoose.Types.ObjectId.isValid(v))
    ),
  ];
  if (!ids.length) return rows;

  const list = await Listing.find({ _id: { $in: ids } })
    .select("title venue city country photosMeta coverIndex")
    .lean();

  const map = new Map(list.map((l) => [String(l._id), pickListing(l)]));
  return rows.map((b) => ({
    ...b,
    listing: map.get(String(b.listingId)) || null,
  }));
}

function parseISO(d) {
  const t = new Date(d);
  return Number.isFinite(t.getTime()) ? t : null;
}

function diffDaysISO(a, b) {
  const d1 = parseISO(a);
  const d2 = parseISO(b);
  if (!d1 || !d2) return null;
  const ms = d2.setHours(12, 0, 0, 0) - d1.setHours(12, 0, 0, 0);
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function firstPrice(listing) {
  const cands = [
    listing.priceSeatDay,
    listing.priceRoomDay,
    listing.priceWholeDay,
    listing.priceSeatHour,
    listing.priceRoomHour,
    listing.priceWholeMonth,
  ];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

const toCentavos = (php) => Math.max(0, Math.round(Number(php || 0) * 100));

async function ensureBookingQrToken(booking) {
  if (!booking.qrToken) {
    booking.qrToken = generateQrToken(booking);
    booking.qrGeneratedAt = new Date();
    await booking.save();
  }
  return booking.qrToken;
}

function buildDateTime(dateStr, timeStr, kind = "start") {
  if (!dateStr) return null;
  const t =
    typeof timeStr === "string" && /^\d{2}:\d{2}$/.test(timeStr)
      ? timeStr
      : kind === "end"
      ? "23:59"
      : "00:00";

  const iso = `${dateStr}T${t}:00`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function hasTimes(obj) {
  return (
    typeof obj?.checkInTime === "string" &&
    /^\d{2}:\d{2}$/.test(obj.checkInTime) &&
    typeof obj?.checkOutTime === "string" &&
    /^\d{2}:\d{2}$/.test(obj.checkOutTime)
  );
}

function dateListInclusive(a, b) {
  const s = parseISO(a);
  const e = parseISO(b);
  if (!s || !e) return [];
  const out = [];
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(e);
  stop.setHours(0, 0, 0, 0);
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isAllDayBooking(b) {
  const inT = String(b?.checkInTime || "");
  const outT = String(b?.checkOutTime || "");
  if (!inT && !outT) return true;

  const looksAllDay =
    (inT === "00:00" || inT === "00:00:00") &&
    (outT === "23:59" ||
      outT === "23:59:00" ||
      outT === "24:00" ||
      outT === "24:00:00");

  return looksAllDay;
}

function isSeatBasedListing(listing) {
  if (!listing) return false;
  const seats = Number(listing.seats || 0);
  const hasSeatPricing = !!(listing.priceSeatHour || listing.priceSeatDay);
  return seats > 1 && hasSeatPricing;
}

function normalizeGuests(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function bookingIntervalForDay(booking, dayISO) {
  if (!booking || !dayISO) return null;

  const inRange =
    String(dayISO) >= String(booking.startDate) && String(dayISO) <= String(booking.endDate);

  if (!inRange) return null;

  if (!hasTimes(booking)) {
    const s = buildDateTime(dayISO, "00:00", "start");
    const e = buildDateTime(dayISO, "23:59", "end");
    if (!s || !e) return null;
    return { start: s, end: e };
  }

  const s = buildDateTime(dayISO, booking.checkInTime, "start");
  const e = buildDateTime(dayISO, booking.checkOutTime, "end");
  if (!s || !e || e <= s) return null;
  return { start: s, end: e };
}

async function findOverlappingBooking({
  listingId,
  startDate,
  endDate,
  checkInTime,
  checkOutTime,
  excludeBookingId,
  requestedGuests,
  listingDoc,
}) {
  console.log('[findOverlappingBooking] Input:', {
    listingId,
    startDate,
    endDate,
    checkInTime,
    checkOutTime,
    requestedGuests
  });

  const windowStart = buildDateTime(startDate, checkInTime, "start");
  const windowEnd = buildDateTime(endDate, checkOutTime, "end");
  
  console.log('[findOverlappingBooking] Window:', {
    windowStart: windowStart?.toISOString(),
    windowEnd: windowEnd?.toISOString()
  });

  if (!windowStart || !windowEnd || windowEnd <= windowStart) {
    console.log('[findOverlappingBooking] Invalid window, returning null');
    return null;
  }

  const q = { listingId, status: { $ne: "cancelled" } };

  if (excludeBookingId && mongoose.Types.ObjectId.isValid(excludeBookingId)) {
    q._id = { $ne: excludeBookingId };
  }

  const dateOverlapFilter = {
    $expr: {
      $and: [
        { $lte: [{ $toDate: "$startDate" }, new Date(endDate)] },
        { $gte: [{ $toDate: "$endDate" }, new Date(startDate)] },
      ],
    },
  };

  const candidates = await Booking.find({ ...q, ...dateOverlapFilter })
    .select("_id startDate endDate checkInTime checkOutTime status guests")
    .lean();

  console.log(`[findOverlappingBooking] Found ${candidates.length} candidate bookings:`, 
    candidates.map(b => ({
      id: b._id,
      dates: `${b.startDate} - ${b.endDate}`,
      times: `${b.checkInTime || 'N/A'} - ${b.checkOutTime || 'N/A'}`,
      status: b.status
    }))
  );

  const reqHasTimes = hasTimes({ checkInTime, checkOutTime });
  const reqIsMultiDay = startDate !== endDate;

  console.log('[findOverlappingBooking] Request info:', {
    reqHasTimes,
    reqIsMultiDay
  });

  const seatBased = isSeatBasedListing(listingDoc);
  const seatCapacity = seatBased ? Math.max(1, Number(listingDoc.seats || 1)) : 1;
  const reqGuests = normalizeGuests(requestedGuests);

  console.log('[findOverlappingBooking] Listing info:', {
    seatBased,
    seatCapacity,
    seats: listingDoc?.seats,
    priceSeatHour: listingDoc?.priceSeatHour,
    priceSeatDay: listingDoc?.priceSeatDay
  });

  if (seatBased) {
    console.log('[findOverlappingBooking] Using seat-based logic...');
    const days = dateListInclusive(startDate, endDate);
    
    console.log(`[findOverlappingBooking] Checking ${days.length} days for seat capacity...`);
    
    for (const day of days) {
      const reqInterval = reqHasTimes
        ? bookingIntervalForDay({ startDate: day, endDate: day, checkInTime, checkOutTime }, day)
        : bookingIntervalForDay({ startDate: day, endDate: day }, day);

      if (!reqInterval) continue;

      let used = 0;

      for (const b of candidates) {
        const bInterval = bookingIntervalForDay(b, day);
        if (!bInterval) continue;
        
        const hasOverlap = overlap(reqInterval.start, reqInterval.end, bInterval.start, bInterval.end);
        
        if (hasOverlap) {
          const guestsUsed = normalizeGuests(b.guests);
          used += guestsUsed;
          console.log(`[findOverlappingBooking] Day ${day}: Booking ${b._id} overlaps, uses ${guestsUsed} seats`);
        }
      }

      console.log(`[findOverlappingBooking] Day ${day}: ${used} seats used, ${reqGuests} requested, ${seatCapacity} total capacity`);

      if (used + reqGuests > seatCapacity) {
        console.log(`[findOverlappingBooking] CAPACITY EXCEEDED on ${day}`);
        return {
          _id: null,
          startDate: day,
          endDate: day,
          checkInTime,
          checkOutTime,
          status: "conflict_capacity",
          guestsUsed: used,
          seats: seatCapacity,
        };
      }
    }
    
    console.log('[findOverlappingBooking] Seat-based check: All days have capacity available');
    return null;
  }

  console.log('[findOverlappingBooking] Using standard overlap detection...');

  for (const b of candidates) {
    if (!b) continue;

    const bookingHasTimes = hasTimes(b);
    const bookingIsMultiDay = b.startDate !== b.endDate;

    console.log(`[findOverlappingBooking] Checking booking ${b._id}:`, {
      bookingHasTimes,
      bookingIsMultiDay,
      dates: `${b.startDate} - ${b.endDate}`,
      times: `${b.checkInTime} - ${b.checkOutTime}`
    });

    if (reqHasTimes && bookingHasTimes && (reqIsMultiDay || bookingIsMultiDay)) {
      console.log('[findOverlappingBooking] Multi-day with times check...');
      
      const reqDates = new Set(dateListInclusive(startDate, endDate));
      const bookDates = dateListInclusive(b.startDate, b.endDate);

      console.log('[findOverlappingBooking] Date ranges:', {
        reqDates: Array.from(reqDates),
        bookDates
      });

      for (const day of bookDates) {
        if (!reqDates.has(day)) continue;

        console.log(`[findOverlappingBooking] Checking day: ${day}`);

        // For multi-day bookings, determine the actual time range for this specific day
        let reqStart, reqEnd, bStart, bEnd;

        // Request booking time range for this day
        if (startDate === endDate) {
          // Single day request
          reqStart = buildDateTime(day, checkInTime, "start");
          reqEnd = buildDateTime(day, checkOutTime, "end");
        } else {
          // Multi-day request
          if (day === startDate) {
            // First day: checkInTime to end of day
            reqStart = buildDateTime(day, checkInTime, "start");
            reqEnd = buildDateTime(day, "23:59", "end");
          } else if (day === endDate) {
            // Last day: start of day to checkOutTime
            reqStart = buildDateTime(day, "00:00", "start");
            reqEnd = buildDateTime(day, checkOutTime, "end");
          } else {
            // Middle day: full day
            reqStart = buildDateTime(day, "00:00", "start");
            reqEnd = buildDateTime(day, "23:59", "end");
          }
        }

        // Existing booking time range for this day
        if (b.startDate === b.endDate) {
          // Single day booking
          bStart = buildDateTime(day, b.checkInTime, "start");
          bEnd = buildDateTime(day, b.checkOutTime, "end");
        } else {
          // Multi-day booking
          if (day === b.startDate) {
            // First day: checkInTime to end of day
            bStart = buildDateTime(day, b.checkInTime, "start");
            bEnd = buildDateTime(day, "23:59", "end");
          } else if (day === b.endDate) {
            // Last day: start of day to checkOutTime
            bStart = buildDateTime(day, "00:00", "start");
            bEnd = buildDateTime(day, b.checkOutTime, "end");
          } else {
            // Middle day: full day
            bStart = buildDateTime(day, "00:00", "start");
            bEnd = buildDateTime(day, "23:59", "end");
          }
        }

        console.log(`[findOverlappingBooking] Day ${day} intervals:`, {
          request: `${reqStart?.toISOString()} - ${reqEnd?.toISOString()}`,
          booking: `${bStart?.toISOString()} - ${bEnd?.toISOString()}`
        });

        if (!reqStart || !reqEnd || !bStart || !bEnd) continue;
        if (reqEnd <= reqStart || bEnd <= bStart) continue;

        const hasOverlap = overlap(reqStart, reqEnd, bStart, bEnd);
        console.log(`[findOverlappingBooking] Overlap check: ${hasOverlap}`);

        if (hasOverlap) {
          console.log(`[findOverlappingBooking] CONFLICT FOUND with booking ${b._id}`);
          return b;
        }
      }

      continue;
    }

    const bStart = buildDateTime(b.startDate, b.checkInTime, "start");
    const bEnd = buildDateTime(b.endDate, b.checkOutTime, "end");
    if (!bStart || !bEnd) continue;

    if (overlap(windowStart, windowEnd, bStart, bEnd)) return b;
  }

  return null;
}

function expandNights(startDate, endDate) {
  const s = parseISO(startDate);
  const e = parseISO(endDate);
  if (!s || !e || e <= s) return [];
  const out = [];
  const d = new Date(s);
  while (d < e) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function sendBookingEmailSafe(booking) {
  try {
    const [user, listing] = await Promise.all([
      User.findById(booking.userId).select("email name firstName lastName").lean(),
      Listing.findById(booking.listingId).select("title venue city country address").lean(),
    ]);

    if (!user || !user.email) return;

    await sendBookingConfirmationEmail({
      to: user.email,
      user,
      booking: booking.toObject ? booking.toObject() : booking,
      listing,
    });
  } catch (err) {
    console.error("Failed to send booking confirmation email:", err);
  }
}

function sumNumericObject(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let sum = 0;
  for (const v of Object.values(obj)) {
    const n = Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

function calcTotalFromPricing({
  pricing,
  listing,
  nightsCount,
  totalHours,
  guestCount,
  multiplyByGuests,
}) {
  const currency = String(listing?.currency || "PHP").toUpperCase();

  const explicitTotal = Number(pricing?.total);
  if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
    return {
      total: explicitTotal,
      currency,
      mode: String(pricing?.mode || "").toLowerCase(),
      unitPrice: Number(pricing?.unitPrice) || null,
      qty: Number(pricing?.qty) || null,
      feesObj: pricing?.fees && typeof pricing.fees === "object" ? pricing.fees : {},
      discounts: Number(pricing?.discount || 0),
    };
  }

  const mode = String(pricing?.mode || "").toLowerCase();

  const unitPrice =
    Number(pricing?.unitPrice) ||
    Number(pricing?.base) ||
    Number(pricing?.rate) ||
    firstPrice(listing);

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    const err = new Error("Invalid unit price");
    err.statusCode = 422;
    throw err;
  }

  const fallbackQty =
    mode === "hour"
      ? Math.max(1, Number(totalHours) || 0)
      : Math.max(1, Number(nightsCount) || 1);

  const qty = Math.max(1, Number(pricing?.qty) || fallbackQty);

  const perGuestFactor = multiplyByGuests ? Math.max(1, Number(guestCount) || 1) : 1;

  const base = unitPrice * qty * perGuestFactor;

  const feesObj =
    pricing?.fees && typeof pricing.fees === "object" ? pricing.fees : {};

  const feesTotal = sumNumericObject(feesObj);
  const discounts = Number(pricing?.discount || 0);

  const total = Math.max(0, base + feesTotal - discounts);

  return { total, currency, unitPrice, qty, feesObj, discounts, mode };
}

/* ===================== READ ===================== */

async function listMine(req, res, next) {
  try {
    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const docs = await Booking.find({ userId: me }).sort({ createdAt: -1 }).lean();
    const withListings = await attachListings(docs);
    
    // Attach cancellation request status for each booking
    const CancellationRequest = require('../models/CancellationRequest');
    const bookingIds = docs.map(d => d._id);
    
    // Find all cancellation requests for these bookings
    const cancellationRequests = await CancellationRequest.find({
      bookingId: { $in: bookingIds },
      status: { $in: ['pending', 'approved', 'processing', 'completed'] }
    }).lean();
    
    // Create a map of bookingId -> cancellation request
    const cancellationMap = new Map();
    cancellationRequests.forEach(req => {
      cancellationMap.set(req.bookingId.toString(), req);
    });
    
    // Attach cancellation request info to each booking
    const withCancellations = withListings.map(booking => {
      const cancellationRequest = cancellationMap.get(booking._id.toString());
      return {
        ...booking,
        hasCancellationRequest: !!cancellationRequest,
        cancellationRequest: cancellationRequest ? {
          _id: cancellationRequest._id,
          status: cancellationRequest.status,
          requestedAt: cancellationRequest.requestedAt,
          refundAmount: cancellationRequest.refundCalculation?.finalRefund,
          cancellationReason: cancellationRequest.cancellationReason
        } : null
      };
    });
    
    return res.json(withCancellations);
  } catch (e) {
    next(e);
  }
}

async function list(req, res, next) {
  try {
    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { all, userId, status } = req.query;
    const q = {};

    if (all && isAdmin(req)) {
      if (userId && mongoose.Types.ObjectId.isValid(userId)) q.userId = userId;
      if (status) q.status = status;
    } else {
      q.userId = me;
    }

    const docs = await Booking.find(q).sort({ createdAt: -1 }).lean();
    return res.json(await attachListings(docs));
  } catch (e) {
    next(e);
  }
}

async function getOne(req, res, next) {
  try {
    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const b = await Booking.findById(id).lean();
    if (!b) return res.status(404).json({ message: "Not found" });
    if (!isAdmin(req) && String(b.userId) !== String(me)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [withListing] = await attachListings([b]);
    return res.json(withListing);
  } catch (e) {
    next(e);
  }
}

async function getBlockedDates(req, res, next) {
  try {
    const { listingId } = req.query || {};

    if (!listingId || !mongoose.isValidObjectId(listingId)) {
      return res.status(422).json({ message: "Invalid listingId" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookings = await Booking.find({
      listingId,
      status: { $ne: "cancelled" },
      endDate: { $gte: today.toISOString().slice(0, 10) },
    })
      .select("startDate endDate checkInTime checkOutTime status")
      .lean();

    const set = new Set();

    for (const b of bookings) {
      if (!isAllDayBooking(b)) continue;
      for (const d of expandNights(b.startDate, b.endDate)) set.add(d);
    }

    return res.json({ blockedDates: Array.from(set).sort() });
  } catch (e) {
    next(e);
  }
}

async function getBusySlots(req, res, next) {
  try {
    const { listingId, startDate, endDate, date } = req.query || {};

    if (!listingId || !mongoose.isValidObjectId(listingId)) {
      return res.status(422).json({ message: "Invalid listingId" });
    }

    const listing = await Listing.findById(listingId).select("seats priceSeatHour priceSeatDay").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const dayStart = String(date || startDate || "");
    const dayEnd = String(endDate || date || startDate || "");

    if (!dayStart || !dayEnd) {
      return res.status(422).json({ message: "Missing date or startDate/endDate" });
    }

    const days = dateListInclusive(dayStart, dayEnd);
    if (!days.length) return res.status(422).json({ message: "Invalid date range" });

    const dateOverlapFilter = {
      $expr: {
        $and: [
          { $lte: [{ $toDate: "$startDate" }, new Date(dayEnd)] },
          { $gte: [{ $toDate: "$endDate" }, new Date(dayStart)] },
        ],
      },
    };

    const bookings = await Booking.find({
      listingId,
      status: { $ne: "cancelled" },
      ...dateOverlapFilter,
    })
      .select("_id startDate endDate checkInTime checkOutTime guests status")
      .lean();

    const seatBased = isSeatBasedListing(listing);
    const seats = seatBased ? Math.max(1, Number(listing.seats || 1)) : 1;

    const busyByDay = {};
    for (const day of days) busyByDay[day] = [];

    for (const b of bookings) {
      for (const day of days) {
        const interval = bookingIntervalForDay(b, day);
        if (!interval) continue;

        busyByDay[day].push({
          bookingId: String(b._id),
          start: interval.start.toISOString(),
          end: interval.end.toISOString(),
          checkInTime: b.checkInTime || null,
          checkOutTime: b.checkOutTime || null,
          guests: normalizeGuests(b.guests),
          allDay: isAllDayBooking(b),
          status: b.status,
        });
      }
    }

    return res.json({
      seatBased,
      seats,
      days,
      busyByDay,
    });
  } catch (e) {
    next(e);
  }
}

/* ===================== AVAILABILITY ===================== */

/**
 * Find available time slots when requested slot is unavailable
 */
async function findAvailableSlots({
  listingId,
  startDate,
  endDate,
  checkInTime,
  checkOutTime,
  guests,
  listingDoc,
  maxSuggestions = 3
}) {
  console.log('[findAvailableSlots] Starting search for:', { startDate, checkInTime, checkOutTime });
  
  const suggestions = {
    sameDaySlots: [],
    alternativeDates: []
  };

  // Define common time slots (9am-7pm, 2-hour blocks)
  const commonSlots = [
    { start: "09:00", end: "11:00" },
    { start: "11:00", end: "13:00" },
    { start: "13:00", end: "15:00" },
    { start: "15:00", end: "17:00" },
    { start: "17:00", end: "19:00" }
  ];

  // 1. Check same-day alternative slots
  console.log('[findAvailableSlots] Checking same-day slots...');
  for (const slot of commonSlots) {
    // Skip if it's the same as requested time
    if (slot.start === checkInTime && slot.end === checkOutTime) {
      console.log(`[findAvailableSlots] Skipping requested slot: ${slot.start}-${slot.end}`);
      continue;
    }

    const overlap = await findOverlappingBooking({
      listingId,
      startDate,
      endDate: startDate, // Same day
      checkInTime: slot.start,
      checkOutTime: slot.end,
      requestedGuests: guests,
      listingDoc
    });

    if (!overlap) {
      console.log(`[findAvailableSlots] Found available slot: ${slot.start}-${slot.end}`);
      suggestions.sameDaySlots.push({
        checkInTime: slot.start,
        checkOutTime: slot.end
      });

      if (suggestions.sameDaySlots.length >= maxSuggestions) break;
    } else {
      console.log(`[findAvailableSlots] Slot unavailable: ${slot.start}-${slot.end}`);
    }
  }

  console.log(`[findAvailableSlots] Same-day slots found: ${suggestions.sameDaySlots.length}`);

  // 2. If no same-day slots, find next available dates
  if (suggestions.sameDaySlots.length === 0) {
    console.log('[findAvailableSlots] No same-day slots, checking alternative dates...');
    const today = new Date(startDate);
    
    for (let i = 1; i <= 7; i++) { // Check next 7 days
      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + i);
      const dateStr = nextDate.toISOString().slice(0, 10);

      // Count available slots for this date
      let availableCount = 0;
      for (const slot of commonSlots) {
        const overlap = await findOverlappingBooking({
          listingId,
          startDate: dateStr,
          endDate: dateStr,
          checkInTime: slot.start,
          checkOutTime: slot.end,
          requestedGuests: guests,
          listingDoc
        });

        if (!overlap) availableCount++;
      }

      console.log(`[findAvailableSlots] Date ${dateStr}: ${availableCount} slots available`);

      if (availableCount > 0) {
        suggestions.alternativeDates.push({
          date: dateStr,
          availableSlots: availableCount
        });

        if (suggestions.alternativeDates.length >= maxSuggestions) break;
      }
    }
  }

  console.log('[findAvailableSlots] Final suggestions:', suggestions);
  return suggestions;
}

async function checkAvailability(req, res, next) {
  try {
    const {
      listingId,
      startDate,
      endDate,
      checkInTime,
      checkOutTime,
      excludeBookingId,
      guests,
    } = req.body || {};

    console.log('[checkAvailability] Request:', {
      listingId,
      startDate,
      endDate,
      checkInTime,
      checkOutTime,
      guests
    });

    if (!listingId || !mongoose.isValidObjectId(listingId)) {
      return res.status(422).json({ message: "Invalid listingId" });
    }
    if (!startDate || !endDate) {
      return res.status(422).json({ message: "Missing startDate or endDate" });
    }

    const listing = await Listing.findById(listingId).select("seats priceSeatHour priceSeatDay").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const overlapBooking = await findOverlappingBooking({
      listingId,
      startDate,
      endDate,
      checkInTime,
      checkOutTime,
      excludeBookingId,
      requestedGuests: guests,
      listingDoc: listing,
    });

    console.log('[checkAvailability] Overlap result:', overlapBooking ? 'CONFLICT' : 'AVAILABLE');

    // If unavailable, find alternative slots
    let suggestions = null;
    if (overlapBooking && checkInTime && checkOutTime) {
      console.log('[checkAvailability] Finding alternative slots...');
      try {
        suggestions = await findAvailableSlots({
          listingId,
          startDate,
          endDate,
          checkInTime,
          checkOutTime,
          guests,
          listingDoc: listing
        });
        console.log('[checkAvailability] Suggestions found:', suggestions);
      } catch (err) {
        console.error("Error finding available slots:", err);
        // Continue without suggestions if there's an error
      }
    }

    const response = {
      available: !overlapBooking,
      reason: overlapBooking?.status === "conflict_capacity" ? "capacity" : overlapBooking ? "overlap" : null,
      capacity: overlapBooking?.status === "conflict_capacity"
        ? { seats: overlapBooking.seats, used: overlapBooking.guestsUsed, requested: normalizeGuests(guests) }
        : null,
      suggestions // Include suggestions when unavailable
    };

    console.log('[checkAvailability] Response:', response);

    return res.json(response);
  } catch (e) {
    console.error('[checkAvailability] Error:', e);
    next(e);
  }
}

/* ===================== WRITE ===================== */

async function cancel(req, res, next) {
  try {
    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const { requestRefund, reason } = req.body || {};
    const wantRefund =
      typeof requestRefund === "string" ? requestRefund === "true" : Boolean(requestRefund);
    const trimmedReason =
      typeof reason === "string" ? reason.trim().slice(0, 2000) : "";

    const b = await Booking.findById(id);
    if (!b) return res.status(404).json({ message: "Not found" });
    if (!isAdmin(req) && String(b.userId) !== String(me)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (b.status === "cancelled") return res.json({ ok: true, booking: b });

    const now = new Date();
    const starts = new Date(b.startDate);
    if (Number.isFinite(starts.getTime()) && starts < now) {
      return res.status(400).json({ message: "Already started; cannot cancel." });
    }

    b.status = "cancelled";

    if (wantRefund) {
      b.refundRequested = true;
      b.refundStatus = "pending";
      b.refundReason = trimmedReason;
      b.refundRequestedAt = new Date();
    }

    await b.save();

    if (wantRefund) {
      try {
        const existing = await Case.findOne({
          bookingId: b._id,
          type: "refund_request",
        }).lean();

        if (!existing) {
          const [user, listing] = await Promise.all([
            User.findById(b.userId).select("email name firstName lastName").lean(),
            Listing.findById(b.listingId).select("title venue").lean(),
          ]);

          const refSuffix = String(b._id).slice(-6).toUpperCase();
          const referenceCode = `RFND-${refSuffix}`;

          const userName =
            user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;

          await Case.create({
            bookingId: b._id,
            userId: b.userId,
            listingId: b.listingId,
            referenceCode,
            type: "refund_request",
            status: "open",
            priority: "medium",
            reportedByRole: "user",
            summary: trimmedReason || `Client requested refund for booking ${b._id}.`,
            amountRequested: b.amount,
            bookingRef: String(b._id),
            userEmail: user?.email || null,
            userName,
            hostEmail: listing?.ownerEmail || null,
            timeline: [
              {
                type: "refund_requested",
                at: new Date(),
                amount: b.amount,
                reason: trimmedReason || null,
              },
            ],
          });
        }
      } catch (err) {
        console.error("Failed to create refund case:", err);
      }
    }

    const [withListing] = await attachListings([b.toObject()]);
    return res.json({ ok: true, booking: withListing });
  } catch (e) {
    next(e);
  }
}

async function markPaid(req, res, next) {
  try {
    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid id" });

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Not found" });

    if (!isAdmin(req) && String(booking.userId) !== String(me)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    booking.status = "paid";
    await ensureBookingQrToken(booking);

    await sendBookingEmailSafe(booking);

    const [withListing] = await attachListings([booking.toObject()]);
    return res.json({ ok: true, booking: withListing });
  } catch (e) {
    next(e);
  }
}

/* ===================== PAYMONGO CHECKOUT ===================== */

async function createBookingIntent(req, res) {
  try {
    if (!PAYMONGO_SECRET_KEY) {
      return res.status(500).json({ message: "Payment gateway not configured." });
    }

    const me = uid(req);
    if (!me) return res.status(401).json({ message: "Unauthenticated" });

    const requestIdem =
      req.get("X-Idempotency-Key") || req.get("Idempotency-Key") || null;

    const {
      listingId,
      startDate,
      endDate,
      nights,
      guests = 1,
      returnUrl,
      multiplyByGuests = false,
      checkInTime,
      checkOutTime,
      totalHours,
      pricing,
    } = req.body || {};

    if (!listingId || !startDate || !endDate) {
      return res.status(422).json({ message: "Missing required fields" });
    }
    if (!mongoose.isValidObjectId(listingId)) {
      return res.status(422).json({ message: "Invalid listingId" });
    }

    const s = parseISO(startDate);
    const e = parseISO(endDate);
    if (!s || !e) return res.status(422).json({ message: "Invalid dates" });
    if (e < s) {
      return res.status(422).json({ message: "endDate must be after startDate" });
    }

    const listing = await Listing.findById(listingId).lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const nightsCount =
      Number.isFinite(Number(nights)) && Number(nights) > 0
        ? Number(nights)
        : diffDaysISO(startDate, endDate) || 1;

    const guestCount = normalizeGuests(guests);

    const overlapping = await findOverlappingBooking({
      listingId,
      startDate,
      endDate,
      checkInTime,
      checkOutTime,
      requestedGuests: guestCount,
      listingDoc: listing,
    });

    if (overlapping) {
      const isCap = overlapping?.status === "conflict_capacity";
      return res.status(409).json({
        message: isCap
          ? "Not enough seats available for the selected time."
          : "Selected dates and times are no longer available for this listing.",
        conflictBookingId: overlapping?._id ? String(overlapping._id) : null,
        reason: isCap ? "capacity" : "overlap",
        capacity: isCap
          ? {
              seats: overlapping.seats,
              used: overlapping.guestsUsed,
              requested: guestCount,
            }
          : null,
      });
    }

    const resolved = calcTotalFromPricing({
      pricing,
      listing,
      nightsCount,
      totalHours,
      guestCount,
      multiplyByGuests,
    });

    if (resolved.currency !== "PHP") {
      return res.status(422).json({
        message: "Only PHP currency is supported for PayMongo checkout.",
      });
    }

    const totalPhp = resolved.total;

    const booking = await Booking.create({
      userId: me,
      listingId,
      startDate,
      endDate,
      nights: nightsCount,
      guests: guestCount,
      currency: "PHP",
      amount: totalPhp,
      status: "paid",
      provider: "paymongo",
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      totalHours: totalHours || null,
      pricingSnapshot: pricing || null,
    });

    const successUrl =
      (returnUrl || `${APP_URL}/app/bookings/thank-you`) + `?bookingId=${booking._id}`;
    const cancelUrl = `${APP_URL}/checkout?cancelled=1&bookingId=${booking._id}`;

    const payload = {
      data: {
        attributes: {
          amount: toCentavos(totalPhp),
          currency: "PHP",
          description: `Booking ${booking._id} • ${listing.venue || listing.title || "Workspace"}`,
          payment_method_types: ["card", "gcash"],
          success_url: successUrl,
          cancel_url: cancelUrl,
          statement_descriptor: "FLEXIDESK",
          metadata: {
            bookingId: String(booking._id),
            listingId: String(listing._id),
            userId: String(me),
            nights: String(nightsCount),
            guests: String(guestCount),
            pricingMode: String(resolved.mode || ""),
            unitPrice: String(resolved.unitPrice || ""),
            qty: String(resolved.qty || ""),
            feesTotal: String(sumNumericObject(resolved.feesObj) || ""),
            discounts: String(resolved.discounts || ""),
            total: String(totalPhp || ""),
          },
          line_items: [
            {
              name: listing.venue || listing.title || "Workspace",
              amount: toCentavos(totalPhp),
              currency: "PHP",
              quantity: 1,
            },
          ],
        },
      },
    };

    const pmRes = await axios.post(
      "https://api.paymongo.com/v1/checkout_sessions",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
          "Idempotency-Key": requestIdem ? String(requestIdem) : String(booking._id),
        },
        timeout: 15000,
      }
    );

    const checkout = pmRes?.data?.data?.attributes || {};
    const checkoutId = pmRes?.data?.data?.id;
    const checkoutUrl = checkout?.checkout_url || checkout?.url;

    await Booking.findByIdAndUpdate(booking._id, {
      $set: { payment: { checkoutId, checkoutUrl, amount: totalPhp, currency: "PHP" } },
    });

    return res.json({
      bookingId: String(booking._id),
      amount: totalPhp,
      currency: "PHP",
      nights: nightsCount,
      guests: guestCount,
      checkout: { id: checkoutId, url: checkoutUrl },
      pricingResolved: {
        mode: resolved.mode,
        unitPrice: resolved.unitPrice,
        qty: resolved.qty,
        fees: resolved.feesObj,
        discounts: resolved.discounts,
        total: totalPhp,
      },
      status: "paid",
    });
  } catch (err) {
    console.error("createBookingIntent error:", err?.response?.data || err);
    const apiError =
      err?.response?.data?.errors?.[0]?.detail ||
      err?.response?.data?.errors?.[0]?.title ||
      err?.message;
    const statusCode = err?.statusCode || 500;
    return res.status(statusCode).json({ message: apiError || "Failed to create checkout" });
  }
}

module.exports = {
  listMine,
  list,
  getOne,
  cancel,
  createBookingIntent,
  markPaid,
  checkAvailability,
  getBlockedDates,
  getBusySlots,
};