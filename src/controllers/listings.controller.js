// controllers/listings.public.controller.js
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Booking = require("../models/Booking"); // <-- add this

// Only expose safe owner fields
const ownerSelect = "fullName role"; // no email for public payloads

function toObjectId(v) {
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

function exposeListing(doc) {
  const d = { ...doc };

  // Normalize id field
  d.id = String(d._id);
  delete d._id;

  // Normalize owner
  const ow = d.owner;
  if (ow && typeof ow === "object") {
    const full = String(ow.fullName || "").trim();
    const firstName = full ? full.split(/\s+/)[0] : "Host";
    d.owner = {
      id: String(ow._id),
      fullName: full || undefined,
      firstName, // <-- handy for the UI
      role: ow.role,
    };
  } else if (ow) {
    // still a bare id (shouldn't happen if populate works)
    d.owner = { id: String(ow) };
  }

  return d;
}

/* ------------------------------------------------------------------ */
/*  NEW: SEARCH HANDLER FOR /api/listings/search                      */
/*  query: where, checkIn, checkOut, guests, limit                    */
/* ------------------------------------------------------------------ */
// GET /api/listings/search?where=Makati&checkIn=2025-11-20&checkOut=2025-11-22&guests=3&minPrice=500&maxPrice=2000&category=office&noiseLevel=quiet&idealFor=freelancers&workStyle=focused
exports.searchPublic = async (req, res) => {
  try {
    const {
      where = "",
      checkIn,
      checkOut,
      guests,
      minPrice,
      maxPrice,
      category,
      noiseLevel,
      idealFor,
      workStyle,
      industry,
      limit = 24,
    } = req.query;

    const pageSize = Math.min(Number(limit) || 24, 50);

    // base query: only active listings
    const q = { status: "active" };
    const andConditions = [];

    // ---- text / location filter ----
    if (where.trim()) {
      const regex = new RegExp(where.trim(), "i");
      andConditions.push({
        $or: [
          { title: regex },
          { venue: regex },
          { city: regex },
          { country: regex },
          { address: regex },
        ]
      });
    }

    // ---- capacity filter ----
    if (guests) {
      const g = Number(guests);
      if (!Number.isNaN(g) && g > 0) {
        q.seats = { $gte: g };
      }
    }

    // ---- price filter (daily rates only for consistency) ----
    if (minPrice || maxPrice) {
      const min = minPrice ? Number(minPrice) : 0;
      const max = maxPrice ? Number(maxPrice) : Infinity;

      if (!Number.isNaN(min) || !Number.isNaN(max)) {
        const priceConditions = [];
        // Focus on daily rates for filtering
        const dailyPriceFields = [
          'priceSeatDay',
          'priceRoomDay',
          'priceWholeDay'
        ];

        dailyPriceFields.forEach(field => {
          const condition = { [field]: { $exists: true, $ne: 0 } };
          if (min > 0) condition[field].$gte = min;
          if (max < Infinity) condition[field].$lte = max;
          priceConditions.push(condition);
        });

        if (priceConditions.length > 0) {
          andConditions.push({ $or: priceConditions });
        }
      }
    }

    // ---- category filter ----
    if (category && category.trim()) {
      q.category = new RegExp(category.trim(), "i");
    }

    // ---- noise level filter ----
    if (noiseLevel && noiseLevel.trim()) {
      q.noiseLevel = new RegExp(noiseLevel.trim(), "i");
    }

    // ---- ideal for filter (demographic) ----
    if (idealFor && idealFor.trim()) {
      q.idealFor = idealFor.trim().toLowerCase();
    }

    // ---- work style filter (demographic) ----
    if (workStyle && workStyle.trim()) {
      q.workStyle = workStyle.trim().toLowerCase();
    }

    // ---- industry filter (demographic) ----
    if (industry && industry.trim()) {
      q.industries = new RegExp(industry.trim(), "i");
    }

    // Combine all AND conditions
    if (andConditions.length > 0) {
      q.$and = andConditions;
    }

    // Initial set of listings matching filters
    let docs = await Listing.find(q)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(pageSize)
      .populate({ path: "owner", select: ownerSelect })
      .lean();

    // ---- optional availability filter (date range) ----
    if (checkIn && checkOut && docs.length) {
      const from = new Date(checkIn + "T00:00:00.000Z");
      const to = new Date(checkOut + "T00:00:00.000Z");

      const listingIds = docs.map((l) => l._id);

      // Adjust Booking fields / statuses to your schema
      const overlappingBookings = await Booking.find({
        listing: { $in: listingIds },
        status: { $in: ["pending", "paid", "confirmed"] },
        // simple date overlap logic
        checkIn: { $lt: to },
        checkOut: { $gt: from },
      }).select("listing");

      const blocked = new Set(
        overlappingBookings.map((b) => String(b.listing))
      );

      docs = docs.filter((l) => !blocked.has(String(l._id)));
    }

    const items = docs.map(exposeListing);

    res.json({
      items,
      count: items.length,
    });
  } catch (e) {
    console.error("searchPublic error", e);
    res
      .status(500)
      .json({ message: e.message || "Failed to search listings" });
  }
};

/* ------------------------------------------------------------------ */
/*  EXISTING PUBLIC LIST + DETAILS                                    */
/* ------------------------------------------------------------------ */

// GET /api/listings?status=active&limit=24&cursor=<_id>
exports.listPublic = async (req, res) => {
  try {
    const { status = "active", limit = 24, cursor } = req.query;

    const pageSize = Math.min(Number(limit) || 24, 50);
    const q = {};
    if (status) q.status = status;

    const find = Listing.find(q)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .populate({ path: "owner", select: ownerSelect });

    // Use a real ObjectId for cursor pagination
    const cursorId = toObjectId(cursor);
    if (cursorId) find.where({ _id: { $lt: cursorId } });

    const docs = await find.lean();
    const hasMore = docs.length > pageSize;
    if (hasMore) docs.pop();

    const items = docs.map(exposeListing);
    const nextCursor = hasMore ? String(docs[docs.length - 1]._id) : null;

    res.json({ items, nextCursor });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load listings" });
  }
};

// GET /api/listings/:id
exports.getPublicById = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await Listing.findOne({ _id: id, status: "active" })
      .populate({ path: "owner", select: ownerSelect })
      .lean();

    if (!doc) return res.status(404).json({ message: "Not found" });

    res.json({ listing: exposeListing(doc) });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load listing" });
  }
};

// GET /api/listings/:id/cancellation-policy
exports.getCancellationPolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await Listing.findOne({ _id: id, status: "active" })
      .select("cancellationPolicy")
      .lean();

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Return the policy or a default "no policy" response
    const policy = listing.cancellationPolicy || {
      type: "none",
      allowCancellation: false,
      tiers: [],
    };

    res.json({ policy });
  } catch (e) {
    console.error("getCancellationPolicy error:", e);
    res.status(500).json({ 
      message: e.message || "Failed to load cancellation policy" 
    });
  }
};

// GET /api/listings/:id/review-stats
exports.getReviewStats = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await Listing.findOne({ _id: id, status: "active" })
      .select("rating ratingAvg reviewCount ratingCount reviewsCount ratingDistribution")
      .lean();

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Get the actual review count
    const reviewCount = listing.ratingCount ?? listing.reviewCount ?? listing.reviewsCount ?? 0;
    const rating = listing.ratingAvg ?? listing.rating ?? 0;
    const distribution = listing.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Minimum 3 reviews required to display rating publicly
    const MINIMUM_REVIEWS_THRESHOLD = 3;
    const hasMinimumReviews = reviewCount >= MINIMUM_REVIEWS_THRESHOLD;

    // Return review statistics
    const stats = {
      rating: hasMinimumReviews ? rating : 0,
      reviewCount: reviewCount,
      distribution: distribution,
      hasMinimumReviews: hasMinimumReviews,
      minimumRequired: MINIMUM_REVIEWS_THRESHOLD,
      message: hasMinimumReviews ? null : "Not enough reviews to display rating",
    };

    res.json(stats);
  } catch (e) {
    console.error("getReviewStats error:", e);
    res.status(500).json({ 
      message: e.message || "Failed to load review statistics" 
    });
  }
};
