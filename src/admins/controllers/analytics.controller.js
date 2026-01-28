const Booking = require("../../models/Booking");
const Listing = require("../../models/Listing");

function formatPeso(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

function resolveDaysFromQuery(query) {
  const { range, datePreset = "last30" } = query;
  if (range === "1d") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  if (range === "1y") return 365;

  if (datePreset === "last1") return 1;
  if (datePreset === "last7") return 7;
  if (datePreset === "last30") return 30;
  if (datePreset === "last90") return 90;
  if (datePreset === "last365") return 365;

  return 30;
}

function isoDayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function shortDateLabel(date) {
  const d = new Date(date);
  return d.toLocaleDateString("en-PH", { month: "short", day: "2-digit" });
}

function weekdayLongLabel(index) {
  const labels = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return labels[index] || "";
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, Number(n)));
}

function movingAverage(values, windowSize = 3) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - (windowSize - 1));
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / Math.max(1, slice.length);
    out.push(avg);
  }
  return out;
}

async function getIncomeAnalytics(req, res) {
  try {
    const { datePreset = "last30", brand, branch, range } = req.query;

    const days = resolveDaysFromQuery({ datePreset, range });

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const filter = {
      createdAt: { $gte: start, $lte: now },
      status: "paid",
    };

    const bookings = await Booking.find(filter)
      .populate({
        path: "listingId",
        model: "Listing",
        select: "venue city brand category scope status",
      })
      .lean();

    const getListingCity = (b) => b?.listingId?.city || "Unknown";
    const getListingBrand = (b) => b?.listingId?.brand || "Unknown";
    const getListingCategory = (b) => b?.listingId?.category || "Workspace";
    const getGross = (b) =>
      Number(b.amount) || Number(b.pricingSnapshot?.total) || 0;
    const getFee = (b) =>
      Number(b.pricingSnapshot?.fees?.service || 0) +
      Number(b.pricingSnapshot?.fees?.cleaning || 0);
    const getRefund = (b) => 0;
    const getDateField = (b) =>
      b.createdAt ? new Date(b.createdAt) : new Date();
    const getProductType = (b) => b?.listingId?.category || "Workspace";
    const getPaymentMethod = (b) => b.provider || "paymongo";

    const bookingList = bookings.filter((b) => {
      if (branch && branch !== "all" && getListingCity(b) !== branch)
        return false;
      if (brand && brand !== "all" && getListingBrand(b) !== brand)
        return false;
      return true;
    });

    const seriesMap = new Map();
    const branchMap = new Map();
    const productMap = new Map();

    let totalGross = 0;
    let totalFees = 0;
    let totalRefunds = 0;
    let totalNet = 0;
    let totalBookings = 0;

    bookingList.forEach((b) => {
      const gross = getGross(b);
      const fee = getFee(b);
      const refund = getRefund(b);
      const net = gross - fee - refund;

      const date = getDateField(b);
      const dateKey = isoDayKey(date);

      const city = getListingCity(b);
      const category = getListingCategory(b);

      totalGross += gross;
      totalFees += fee;
      totalRefunds += refund;
      totalNet += net;
      totalBookings++;

      if (!seriesMap.has(dateKey)) {
        seriesMap.set(dateKey, {
          date: dateKey,
          gross: 0,
          refunds: 0,
          fees: 0,
          net: 0,
          bookings: 0,
        });
      }
      const s = seriesMap.get(dateKey);
      s.gross += gross;
      s.refunds += refund;
      s.fees += fee;
      s.net += net;
      s.bookings += 1;

      branchMap.set(city, (branchMap.get(city) || 0) + gross);
      productMap.set(category, (productMap.get(category) || 0) + gross);
    });

    const series = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = isoDayKey(day);
      series.push(
        seriesMap.get(key) || {
          date: key,
          gross: 0,
          refunds: 0,
          fees: 0,
          net: 0,
          bookings: 0,
        }
      );
    }

    const byBranch = Array.from(branchMap.entries())
      .map(([city, revenue]) => ({ branch: city, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const byProduct = Array.from(productMap.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const avgBookingValue = totalBookings > 0 ? totalGross / totalBookings : 0;
    const takeRate = totalGross > 0 ? totalFees / totalGross : 0;
    const mrr = days > 0 ? totalNet / (days / 30) : 0;

    const rows = bookingList
      .sort((a, b) => getDateField(b) - getDateField(a))
      .map((b) => {
        const gross = getGross(b);
        const fee = getFee(b);
        const refund = getRefund(b);
        const net = gross - fee - refund;

        return {
          id: b._id.toString(),
          date: b.createdAt,
          branch: getListingCity(b),
          brand: getListingBrand(b),
          type: getProductType(b),
          method: getPaymentMethod(b),
          status: b.status,
          gross,
          fee,
          refund,
          net,
        };
      });

    res.json({
      permissionError: false,
      series,
      byBranch,
      byProduct,
      summary: {
        totalGross,
        totalNet,
        refunds: totalRefunds,
        fees: totalFees,
        avgBookingValue,
        bookings: totalBookings,
        takeRate,
        conversion: 0,
        mrr,
      },
      rows,
    });
  } catch (err) {
    console.error("getIncomeAnalytics error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

async function getOccupancyReport(req, res) {
  try {
    const { brand = "all", branch = "all", type = "all", status = "all", range, datePreset } =
      req.query;

    const days = resolveDaysFromQuery({ range, datePreset });

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const listingFilter = {};
    if (brand !== "all") listingFilter.brand = brand;
    if (branch !== "all") listingFilter.city = branch;
    if (type !== "all") listingFilter.category = type;
    if (status !== "all") listingFilter.status = status;

    const listings = await Listing.find(listingFilter).lean();

    if (!listings.length) {
      return res.json({
        permissionError: false,
        summary: {
          avgOccupancy: 0,
          peakHour: "",
          peakDay: "",
          underutilizedCount: 0,
        },
        byHour: [],
        byBranch: [],
        rows: [],
        brandOptions: [],
        branchOptions: [],
        typeOptions: [],
        statusOptions: [],
      });
    }

    const listingIds = listings.map((l) => l._id);

    const bookings = await Booking.find({
      listingId: { $in: listingIds },
      status: { $in: ["paid", "confirmed", "completed"] },
      createdAt: { $gte: start, $lte: end },
    }).lean();

    const perListing = new Map();
    const perBranch = new Map();
    const perHourBooked = new Array(24).fill(0);

    const brandSet = new Set();
    const branchSet = new Set();
    const typeSet = new Set();
    const statusSet = new Set();

    const msPerHour = 60 * 60 * 1000;
    const rangeHours = Math.max(1, (end - start) / msPerHour);

    listings.forEach((l) => {
      perListing.set(String(l._id), { listing: l, bookedHours: 0 });

      if (l.city && !perBranch.has(l.city)) {
        perBranch.set(l.city, { branch: l.city, occSum: 0, count: 0 });
      }

      if (l.brand) brandSet.add(l.brand);
      if (l.city) branchSet.add(l.city);
      if (l.category) typeSet.add(l.category);
      if (l.status) statusSet.add(l.status);
    });

    function resolveBookingWindow(b) {
      if (b.start && b.end) {
        return { s: new Date(b.start), e: new Date(b.end) };
      }
      if (b.startDate && b.endDate) {
        const checkIn = b.checkInTime || "09:00";
        const checkOut = b.checkOutTime || "18:00";
        return {
          s: new Date(`${b.startDate}T${checkIn}`),
          e: new Date(`${b.endDate}T${checkOut}`),
        };
      }
      const base = b.createdAt ? new Date(b.createdAt) : new Date();
      const hours = b.totalHours || 1;
      return { s: base, e: new Date(base.getTime() + hours * msPerHour) };
    }

    bookings.forEach((b) => {
      const lid = String(b.listingId);
      const ls = perListing.get(lid);
      if (!ls) return;

      const { s, e } = resolveBookingWindow(b);
      if (!s || !e) return;

      const startClipped = new Date(Math.max(s.getTime(), start.getTime()));
      const endClipped = new Date(Math.min(e.getTime(), end.getTime()));
      const hours = Math.max(0, (endClipped - startClipped) / msPerHour);
      if (hours <= 0) return;

      ls.bookedHours += hours;

      const h = startClipped.getHours();
      if (h >= 0 && h < 24) perHourBooked[h] += hours;
    });

    const rows = [];
    let occSum = 0;
    let occCount = 0;
    let underutilizedCount = 0;

    perListing.forEach(({ listing, bookedHours }) => {
      const capacity = listing.capacity || 1;
      const possibleHours = rangeHours * capacity;
      const avgOcc = possibleHours > 0 ? bookedHours / possibleHours : 0;

      occSum += avgOcc;
      occCount += 1;
      if (avgOcc < 0.4) underutilizedCount += 1;

      rows.push({
        id: listing.code || listing._id.toString().slice(-6).toUpperCase(),
        name: listing.venue || listing.name,
        brand: listing.brand,
        branch: listing.city,
        type: listing.category,
        capacity: listing.capacity,
        avgOcc,
        peak: "",
        updatedAt: listing.updatedAt || listing.createdAt,
        status: listing.status || "active",
      });

      const branchRec = perBranch.get(listing.city);
      if (branchRec) {
        branchRec.occSum += avgOcc;
        branchRec.count += 1;
      }
    });

    const avgOccupancy = occCount ? occSum / occCount : 0;

    const byHour = perHourBooked.map((booked, hourIndex) => {
      const totalCapacity = listings.reduce(
        (s, l) => s + (Number(l.capacity) || 1),
        0
      );
      const possible = totalCapacity * days;
      const rate = possible > 0 ? booked / possible : 0;
      return {
        hour: `${String(hourIndex).padStart(2, "0")}:00`,
        rate: clamp01(rate),
      };
    });

    let peakHourLabel = "";
    let peakRate = 0;
    byHour.forEach((h) => {
      if (h.rate > peakRate) {
        peakRate = h.rate;
        peakHourLabel = h.hour;
      }
    });
    if (peakRate === 0) peakHourLabel = "";

    const byBranch = Array.from(perBranch.values()).map((b) => ({
      branch: b.branch,
      occ: b.count ? clamp01(b.occSum / b.count) : 0,
    }));

    const brandOptions = Array.from(brandSet).sort();
    const branchOptions = Array.from(branchSet).sort();
    const typeOptions = Array.from(typeSet).sort();
    const statusOptions = Array.from(statusSet).sort();

    res.json({
      permissionError: false,
      summary: {
        avgOccupancy,
        peakHour: peakHourLabel,
        peakDay: "",
        underutilizedCount,
      },
      byHour,
      byBranch,
      rows,
      brandOptions,
      branchOptions,
      typeOptions,
      statusOptions,
    });
  } catch (err) {
    console.error("getOccupancyReport error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

async function getAnalyticsOverview(req, res) {
  try {
    const days = resolveDaysFromQuery(req.query);
    const { city, category, status } = req.query;

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const end = new Date(now);

    // Build booking filter
    const bookingFilter = {
      createdAt: { $gte: start, $lte: end },
      status: { $in: ["paid", "confirmed", "completed"] },
    };

    // Add status filter if specified
    if (status && status !== "all") {
      bookingFilter.status = status;
    }

    const bookings = await Booking.find(bookingFilter)
      .populate({
        path: "listingId",
        model: "Listing",
        select: "venue city brand category scope status",
      })
      .lean();

    // Apply listing-based filters (city, category)
    const filteredBookings = bookings.filter((b) => {
      if (!b.listingId) return false;
      
      if (city && city !== "all" && b.listingId.city !== city) {
        return false;
      }
      
      if (category && category !== "all" && b.listingId.category !== category) {
        return false;
      }
      
      return true;
    });

    const getListingCategory = (b) => b?.listingId?.category || "Workspace";
    const getGross = (b) =>
      Number(b.amount) || Number(b.pricingSnapshot?.total) || 0;
    const getClientId = (b) =>
      b.clientId ? String(b.clientId) : b.userId ? String(b.userId) : "";

    const bookingsMapByDay = new Map();
    const bookingsByTypeMap = new Map();
    const activeUserSet = new Set();

    let totalRevenue = 0;

    filteredBookings.forEach((b) => {
      const created = b.createdAt ? new Date(b.createdAt) : new Date();
      const key = isoDayKey(created);
      const gross = getGross(b);
      const cat = getListingCategory(b);
      const clientId = getClientId(b);

      totalRevenue += gross;

      bookingsMapByDay.set(key, (bookingsMapByDay.get(key) || 0) + 1);
      bookingsByTypeMap.set(
        cat,
        (bookingsByTypeMap.get(cat) || 0) + 1
      );

      if (clientId) activeUserSet.add(clientId);
    });

    const perDay = [];
    let maxDailyBookings = 0;

    for (let i = 0; i < days; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = isoDayKey(day);
      const count = bookingsMapByDay.get(key) || 0;
      if (count > maxDailyBookings) maxDailyBookings = count;
      perDay.push({ key, date: day, count });
    }

    if (maxDailyBookings === 0) maxDailyBookings = 1;

    const occupancyValues = perDay.map((r) =>
      Math.round((r.count / maxDailyBookings) * 100)
    );

    const occupancySeries = perDay.map((row, idx) => {
      const occupancy = occupancyValues[idx];
      const label = shortDateLabel(row.date);
      return { label, occupancy, forecast: occupancy };
    });

    const avgOccupancy =
      occupancySeries.length > 0
        ? Math.round(
            occupancySeries.reduce((sum, r) => sum + r.occupancy, 0) /
              occupancySeries.length
          )
        : 0;

    const bookingsByType =
      bookingsByTypeMap.size > 0
        ? Array.from(bookingsByTypeMap.entries()).map(([type, bookings]) => ({
            type,
            bookings,
          }))
        : [];

    res.json({
      permissionError: false,
      avgOccupancy: `${avgOccupancy}%`,
      totalBookings: filteredBookings.length,
      totalRevenue,
      totalRevenueFormatted: formatPeso(totalRevenue),
      activeUsers: activeUserSet.size,
      occupancySeries,
      bookingsByType,
    });
  } catch (err) {
    console.error("getAnalyticsOverview error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

async function getAnalyticsForecast(req, res) {
  try {
    const days = resolveDaysFromQuery(req.query);

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const end = new Date(now);

    const bookings = await Booking.find({
      createdAt: { $gte: start, $lte: end },
      status: { $in: ["paid", "confirmed", "completed"] },
    }).lean();

    const bookingsMapByDay = new Map();
    const perHourCount = new Array(24).fill(0);
    const perDayForWeekday = [];

    bookings.forEach((b) => {
      const created = b.createdAt ? new Date(b.createdAt) : new Date();
      if (created < start || created > end) return;

      const key = isoDayKey(created);
      bookingsMapByDay.set(key, (bookingsMapByDay.get(key) || 0) + 1);

      perHourCount[created.getHours()] += 1;
    });

    const perDay = [];
    let maxDailyBookings = 0;

    for (let i = 0; i < days; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = isoDayKey(day);
      const count = bookingsMapByDay.get(key) || 0;

      perDay.push({ date: day, count });

      if (count > maxDailyBookings) maxDailyBookings = count;

      perDayForWeekday.push({ dayIndex: day.getDay(), count });
    }

    if (maxDailyBookings === 0) maxDailyBookings = 1;

    const actualOcc = perDay.map((row) =>
      Math.round((row.count / maxDailyBookings) * 100)
    );
    const fcOcc = movingAverage(actualOcc, 3).map((v) => Math.round(v));

    const occupancySeries = perDay.map((row, idx) => ({
      label: shortDateLabel(row.date),
      occupancy: actualOcc[idx],
      forecast: fcOcc[idx],
    }));

    const lastFew = perDay.slice(-Math.min(5, perDay.length));
    let projectedOccupancy = "0%";
    if (lastFew.length && maxDailyBookings > 0) {
      const avgRecent =
        lastFew.reduce((sum, r) => sum + r.count, 0) / lastFew.length;
      const pct = Math.round((avgRecent / maxDailyBookings) * 100);
      projectedOccupancy = `${pct}%`;
    }

    const revenueAgg = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ["paid", "confirmed", "completed"] },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $ifNull: [
                "$amount",
                { $ifNull: ["$pricingSnapshot.total", 0] },
              ],
            },
          },
        },
      },
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const projectedRevenue = totalRevenue > 0 ? totalRevenue * 1.08 : 0;

    const weekdayStats = perDayForWeekday.reduce((acc, row) => {
      if (!acc[row.dayIndex]) acc[row.dayIndex] = { sum: 0, count: 0 };
      acc[row.dayIndex].sum += row.count;
      acc[row.dayIndex].count += 1;
      return acc;
    }, {});

    let nextPeakDay = "";
    let peakDayScore = -1;

    Object.keys(weekdayStats).forEach((key) => {
      const idx = Number(key);
      const s = weekdayStats[idx];
      const avg = s.sum / s.count;
      if (avg > peakDayScore) {
        peakDayScore = avg;
        nextPeakDay = weekdayLongLabel(idx);
      }
    });

    const hourBuckets = {
      Morning: 0,
      Afternoon: 0,
      Evening: 0,
    };

    perHourCount.forEach((count, hourIndex) => {
      if (hourIndex >= 6 && hourIndex < 12) hourBuckets.Morning += count;
      else if (hourIndex >= 12 && hourIndex < 18) hourBuckets.Afternoon += count;
      else hourBuckets.Evening += count;
    });

    const demandCycles = [
      { label: "Morning", value: hourBuckets.Morning },
      { label: "Afternoon", value: hourBuckets.Afternoon },
      { label: "Evening", value: hourBuckets.Evening },
    ];

    const maxDemand = demandCycles.reduce((m, r) => Math.max(m, r.value), 0);
    const minDemand = demandCycles.reduce(
      (m, r) => (m === 0 ? r.value : Math.min(m, r.value)),
      0
    );

    const highRiskPeriods = [];

    if (maxDemand > 0) {
      highRiskPeriods.push({
        label: "Over-capacity risk",
        description: nextPeakDay
          ? `${nextPeakDay}, 3:00 PM – 6:00 PM`
          : "Busiest demand window based on recent data",
        level: "High",
        kind: "over",
      });
    }

    if (minDemand > 0) {
      highRiskPeriods.push({
        label: "Under-utilization risk",
        description: "Lowest demand window based on recent data",
        level: "Medium",
        kind: "under",
      });
    }

    res.json({
      permissionError: false,
      nextPeakDay,
      nextPeakHour: nextPeakDay ? "3:00 PM – 6:00 PM" : "",
      projectedOccupancy,
      projectedRevenue,
      projectedRevenueFormatted: formatPeso(projectedRevenue),
      demandCycles,
      highRiskPeriods,
      occupancySeries,
    });
  } catch (err) {
    console.error("getAnalyticsForecast error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

async function getAnalyticsPrescriptive(req, res) {
  try {
    const days = resolveDaysFromQuery(req.query);

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const end = new Date(now);

    const bookings = await Booking.find({
      createdAt: { $gte: start, $lte: end },
    })
      .populate({
        path: "listingId",
        model: "Listing",
        select: "venue city brand category capacity status",
      })
      .lean();

    const completed = bookings.filter((b) =>
      ["paid", "confirmed", "completed"].includes(b.status)
    );
    const cancelled = bookings.filter((b) =>
      ["cancelled", "canceled", "refunded"].includes(b.status)
    );

    const grossTotal = completed.reduce((s, b) => {
      const g = Number(b.amount) || Number(b.pricingSnapshot?.total) || 0;
      return s + g;
    }, 0);

    const feeTotal = completed.reduce((s, b) => {
      const f =
        Number(b.pricingSnapshot?.fees?.service || 0) +
        Number(b.pricingSnapshot?.fees?.cleaning || 0);
      return s + f;
    }, 0);

    const netTotal = Math.max(0, grossTotal - feeTotal);
    const cancelRate =
      bookings.length > 0 ? cancelled.length / bookings.length : 0;

    const byHour = new Array(24).fill(0);
    completed.forEach((b) => {
      const created = b.createdAt ? new Date(b.createdAt) : null;
      if (!created) return;
      const h = created.getHours();
      if (h >= 0 && h < 24) byHour[h] += 1;
    });

    let peakHour = -1;
    let peakHourCount = 0;
    byHour.forEach((c, h) => {
      if (c > peakHourCount) {
        peakHourCount = c;
        peakHour = h;
      }
    });

    const peakWindow =
      peakHour >= 0
        ? `${String(peakHour).padStart(2, "0")}:00 – ${String(
            (peakHour + 3) % 24
          ).padStart(2, "0")}:00`
        : "";

    const listingGross = new Map();
    completed.forEach((b) => {
      const lid = b.listingId?._id ? String(b.listingId._id) : null;
      if (!lid) return;
      const g = Number(b.amount) || Number(b.pricingSnapshot?.total) || 0;
      listingGross.set(lid, (listingGross.get(lid) || 0) + g);
    });

    const topListings = Array.from(listingGross.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const insights = [];

    const avgNetPerDay = days > 0 ? netTotal / days : 0;

    if (avgNetPerDay > 0 && peakHourCount >= Math.max(3, Math.ceil(days / 10))) {
      insights.push({
        key: "pricing-peak",
        severity: "high",
        title: "Increase pricing during peak window",
        description:
          "Bookings concentrate in a predictable peak window. Use dynamic pricing to improve revenue while protecting availability.",
        actions: [
          "Add peak-hour pricing rule for the busiest 3-hour window",
          "Increase peak prices by 5–10% and monitor conversion",
          "Require minimum 2-hour booking during peak slots",
        ],
        tags: ["pricing", "peak"],
        kpis: { peakWindow, peakHourCount },
      });
    }

    if (cancelRate >= 0.12) {
      insights.push({
        key: "cancel-policy",
        severity: "high",
        title: "Reduce cancellations and last-minute churn",
        description:
          "Cancellation rate is elevated. Tighten rules near peak windows and introduce guardrails that protect revenue.",
        actions: [
          "Shorten free-cancel cutoff (e.g., 24 hours before start)",
          "Require prepayment for high-demand time slots",
          "Offer rebooking credit instead of refunds for last-minute cancels",
        ],
        tags: ["policy", "risk"],
        kpis: { cancelRate: Math.round(cancelRate * 100) },
      });
    } else if (cancelRate >= 0.06) {
      insights.push({
        key: "cancel-policy-lite",
        severity: "medium",
        title: "Tune cancellation controls",
        description:
          "Some churn is present. Minor adjustments can reduce revenue leakage without harming user experience.",
        actions: [
          "Add reminder notifications 24 hours before booking",
          "Introduce partial refund for late cancellations",
          "Highlight policies clearly at checkout",
        ],
        tags: ["policy"],
        kpis: { cancelRate: Math.round(cancelRate * 100) },
      });
    }

    if (topListings.length) {
      insights.push({
        key: "optimize-top-listings",
        severity: "medium",
        title: "Prioritize top-performing listings",
        description:
          "A small set of listings drives a large share of revenue. Improve their availability and experience first for faster impact.",
        actions: [
          "Ensure these listings have complete amenities and photos",
          "Extend operating hours on top listings during peak days",
          "Enable instant booking for trusted hosts where possible",
        ],
        tags: ["ops", "growth"],
        kpis: {
          topListings: topListings.map((x) => x[0]).length,
        },
      });
    }

    const estimatedRevenueLift = grossTotal > 0 ? Math.round(grossTotal * 0.06) : 0;
    const estimatedOccupancyLift = 4;
    const riskScore = Math.round(
      clamp01(cancelRate * 2 + (peakHourCount > 0 ? 0.2 : 0)) * 100
    );

    res.json({
      permissionError: false,
      summary: {
        recommendedActions: insights.length,
        estimatedRevenueLift,
        estimatedOccupancyLift,
        riskScore,
      },
      insights,
    });
  } catch (err) {
    console.error("getAnalyticsPrescriptive error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

/**
 * GET /admin/analytics/demographics
 * Get demographics analytics showing booking patterns and listing distribution
 * based on idealFor, workStyle, and industries fields
 */
async function getDemographicsAnalytics(req, res) {
  try {
    const days = resolveDaysFromQuery(req.query);
    const { city, category, status } = req.query;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Build listing filter
    const listingFilter = { status: { $ne: "archived" } };
    if (city && city !== "all") {
      listingFilter.city = city;
    }
    if (category && category !== "all") {
      listingFilter.category = category;
    }

    // Get all listings with their demographics
    const listings = await Listing.find(listingFilter)
      .select("idealFor workStyle industries city category")
      .lean();

    // Build booking filter
    const bookingFilter = {
      createdAt: { $gte: cutoff },
      status: { $in: ["paid", "confirmed", "completed", "checked_in"] }
    };
    
    if (status && status !== "all") {
      bookingFilter.status = status;
    }

    // Get bookings within date range with listing demographics
    const bookings = await Booking.find(bookingFilter)
      .populate("listingId", "idealFor workStyle industries city category")
      .lean();

    // Apply listing-based filters to bookings
    const filteredBookings = bookings.filter((b) => {
      if (!b.listingId) return false;
      
      if (city && city !== "all" && b.listingId.city !== city) {
        return false;
      }
      
      if (category && category !== "all" && b.listingId.category !== category) {
        return false;
      }
      
      return true;
    });

    // Initialize counters
    const listingsByIdealFor = {};
    const listingsByWorkStyle = {};
    const bookingsByIdealFor = {};
    const bookingsByWorkStyle = {};
    const revenueByIdealFor = {};
    const revenueByWorkStyle = {};
    const industriesMap = {};

    // Count listings by demographics
    listings.forEach(listing => {
      // Count idealFor
      if (listing.idealFor && Array.isArray(listing.idealFor)) {
        listing.idealFor.forEach(ideal => {
          listingsByIdealFor[ideal] = (listingsByIdealFor[ideal] || 0) + 1;
        });
      }

      // Count workStyle
      if (listing.workStyle && Array.isArray(listing.workStyle)) {
        listing.workStyle.forEach(style => {
          listingsByWorkStyle[style] = (listingsByWorkStyle[style] || 0) + 1;
        });
      }

      // Count industries
      if (listing.industries && Array.isArray(listing.industries)) {
        listing.industries.forEach(industry => {
          if (!industriesMap[industry]) {
            industriesMap[industry] = { count: 0, revenue: 0, bookings: 0 };
          }
          industriesMap[industry].count += 1;
        });
      }
    });

    // Count bookings and revenue by demographics
    filteredBookings.forEach(booking => {
      const listing = booking.listingId;
      if (!listing) return;

      const amount = Number(booking.amount || 0);

      // Count by idealFor
      if (listing.idealFor && Array.isArray(listing.idealFor)) {
        listing.idealFor.forEach(ideal => {
          bookingsByIdealFor[ideal] = (bookingsByIdealFor[ideal] || 0) + 1;
          revenueByIdealFor[ideal] = (revenueByIdealFor[ideal] || 0) + amount;
        });
      }

      // Count by workStyle
      if (listing.workStyle && Array.isArray(listing.workStyle)) {
        listing.workStyle.forEach(style => {
          bookingsByWorkStyle[style] = (bookingsByWorkStyle[style] || 0) + 1;
          revenueByWorkStyle[style] = (revenueByWorkStyle[style] || 0) + amount;
        });
      }

      // Count by industries
      if (listing.industries && Array.isArray(listing.industries)) {
        listing.industries.forEach(industry => {
          if (industriesMap[industry]) {
            industriesMap[industry].bookings += 1;
            industriesMap[industry].revenue += amount;
          }
        });
      }
    });

    // Calculate trends over time (monthly)
    const monthlyTrends = {};
    filteredBookings.forEach(booking => {
      const listing = booking.listingId;
      if (!listing) return;

      const monthKey = booking.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyTrends[monthKey]) {
        monthlyTrends[monthKey] = {};
      }

      if (listing.idealFor && Array.isArray(listing.idealFor)) {
        listing.idealFor.forEach(ideal => {
          monthlyTrends[monthKey][ideal] = (monthlyTrends[monthKey][ideal] || 0) + 1;
        });
      }
    });

    // Convert monthly trends to array
    const trendsOverTime = Object.keys(monthlyTrends)
      .sort()
      .map(month => ({
        month,
        ...monthlyTrends[month]
      }));

    // Get top industries
    const topIndustries = Object.entries(industriesMap)
      .map(([name, data]) => ({
        name,
        listingCount: data.count,
        bookingCount: data.bookings,
        revenue: data.revenue
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Calculate metrics
    const totalListings = listings.length;
    const listingsWithDemographics = listings.filter(
      l => (l.idealFor && l.idealFor.length > 0) || 
           (l.workStyle && l.workStyle.length > 0) ||
           (l.industries && l.industries.length > 0)
    ).length;
    const listingsWithoutDemographics = totalListings - listingsWithDemographics;

    // Find most popular
    const mostPopularIdealFor = Object.entries(bookingsByIdealFor)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
    const mostPopularWorkStyle = Object.entries(bookingsByWorkStyle)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
    const topIndustry = topIndustries[0]?.name || "none";

    // Calculate average bookings per demographic
    const totalDemographicBookings = Object.values(bookingsByIdealFor).reduce((sum, val) => sum + val, 0);
    const uniqueDemographics = Object.keys(bookingsByIdealFor).length;
    const avgBookingsPerDemographic = uniqueDemographics > 0 
      ? (totalDemographicBookings / uniqueDemographics).toFixed(1)
      : 0;

    // Calculate total revenue
    const totalRevenue = Object.values(revenueByIdealFor).reduce((sum, val) => sum + val, 0);

    res.json({
      success: true,
      data: {
        // Listing distribution
        listingsByIdealFor,
        listingsByWorkStyle,
        
        // Booking patterns
        bookingsByIdealFor,
        bookingsByWorkStyle,
        
        // Revenue
        revenueByIdealFor,
        revenueByWorkStyle,
        totalRevenue,
        
        // Industries
        topIndustries,
        
        // Trends
        trendsOverTime,
        
        // Metrics
        metrics: {
          totalListings,
          listingsWithDemographics,
          listingsWithoutDemographics,
          percentageWithDemographics: totalListings > 0 
            ? ((listingsWithDemographics / totalListings) * 100).toFixed(1)
            : 0,
          avgBookingsPerDemographic,
          mostPopularIdealFor,
          mostPopularWorkStyle,
          topIndustry,
          totalBookings: filteredBookings.length
        }
      }
    });
  } catch (err) {
    console.error("getDemographicsAnalytics error", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

module.exports = {
  getIncomeAnalytics,
  getOccupancyReport,
  getAnalyticsOverview,
  getAnalyticsForecast,
  getAnalyticsPrescriptive,
  getDemographicsAnalytics,
};
