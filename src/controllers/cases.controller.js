// src/controllers/cases.controller.js
const mongoose = require("mongoose");
const Case = require("../models/Case");
const Booking = require("../models/Booking");

const uid = (req) => req.user?._id || req.user?.id || req.user?.uid || null;

function toIdList(input) {
  const raw = String(input || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const v of raw) {
    if (mongoose.Types.ObjectId.isValid(v)) out.push(new mongoose.Types.ObjectId(v));
  }
  return out;
}

function pickCase(c) {
  if (!c) return null;
  return {
    _id: c._id,
    referenceCode: c.referenceCode,
    bookingId: c.bookingId,
    bookingRef: c.bookingRef,
    listingId: c.listingId,
    userId: c.userId,
    userEmail: c.userEmail,
    userName: c.userName,
    hostEmail: c.hostEmail,
    amountRequested: c.amountRequested,
    type: c.type,
    priority: c.priority,
    status: c.status,
    reportedByRole: c.reportedByRole,
    summary: c.summary,
    timeline: c.timeline,
    evidence: c.evidence,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function getMyCasesByBookingIds(req, res) {
  try {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const bookingIdsStr = req.query.bookingIds || req.query.booking_ids || "";
    const type = String(req.query.type || "").trim();

    const bookingIdsObj = toIdList(bookingIdsStr);
    if (!bookingIdsObj.length) return res.json({ items: [] });

    const owned = await Booking.find({ _id: { $in: bookingIdsObj }, userId })
      .select("_id")
      .lean();

    const allowedBookingIds = owned.map((b) => b._id);
    if (!allowedBookingIds.length) return res.json({ items: [] });

    const q = {
      $and: [
        {
          $or: [
            { bookingId: { $in: allowedBookingIds } },
            { bookingRef: { $in: allowedBookingIds.map(String) } },
          ],
        },
        { userId },
      ],
    };

    if (type) q.$and.push({ type });

    const rows = await Case.find(q).sort({ updatedAt: -1, createdAt: -1 }).lean();
    return res.json({ items: rows.map(pickCase) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load cases." });
  }
}

module.exports = { getMyCasesByBookingIds };