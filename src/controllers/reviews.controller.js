// src/controllers/reviews.controller.js
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");

function toId(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
    if (v.uid) return String(v.uid);
  }
  return String(v);
}

function resolveBookingUserId(booking) {
  const raw =
    booking?.user ||
    booking?.client ||
    booking?.customer ||
    booking?.clientId ||
    booking?.userId;
  return toId(raw);
}

function resolveAuthIds(req) {
  const mongoId = toId(req.user?._id || req.user?.id || req.user?.userId);
  const firebaseUid = toId(req.user?.uid);
  return { mongoId, firebaseUid };
}

const recalcListingRating = async (listingId) => {
  const [stats] = await Review.aggregate([
    { $match: { listing: listingId, status: "visible" } },
    {
      $group: {
        _id: "$listing",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (!stats) {
    await Listing.findByIdAndUpdate(listingId, {
      $set: {
        ratingAvg: 0,
        ratingCount: 0,
        rating: 0,
        reviewsCount: 0,
      },
    }).catch(() => {});
    return;
  }

  const avg = Math.round(stats.avgRating * 10) / 10;
  const count = stats.count;

  await Listing.findByIdAndUpdate(listingId, {
    $set: {
      ratingAvg: avg,
      ratingCount: count,
      rating: avg,
      reviewsCount: count,
    },
  }).catch(() => {});
};

exports.createForBooking = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { rating, comment } = req.body;

    if (!rating) {
      return res.status(400).json({ message: "Rating is required." });
    }

    const booking = await Booking.findById(bookingId).populate("listingId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const bookingUserId = resolveBookingUserId(booking);

    if (!bookingUserId || (!mongoId && !firebaseUid)) {
      return res.status(403).json({ message: "Not allowed to review this booking." });
    }

    const matchesMongo = mongoId && bookingUserId === mongoId;
    const matchesUid = firebaseUid && bookingUserId === firebaseUid;

    if (!matchesMongo && !matchesUid) {
      return res.status(403).json({ message: "Not allowed to review this booking." });
    }

    const now = new Date();
    const start = booking.startDate || booking.from;
    const bookingStatus = booking.status;

    // Prevent reviews for cancelled bookings
    if (bookingStatus === "cancelled") {
      return res
        .status(400)
        .json({ message: "You cannot review cancelled bookings." });
    }

    // Prevent reviews for future bookings (unless completed)
    if (bookingStatus === "pending_payment" || bookingStatus === "awaiting_payment") {
      return res
        .status(400)
        .json({ message: "You cannot review bookings with pending payment." });
    }

    // Allow reviews only if:
    // 1. Booking status is "completed", OR
    // 2. Booking start date is in the past (and status is "paid")
    const isPastBooking = start && new Date(start) < now;
    const isCompleted = bookingStatus === "completed";
    const isPaid = bookingStatus === "paid";

    if (!isCompleted && !(isPastBooking && isPaid)) {
      return res
        .status(400)
        .json({ message: "You can only review completed or past bookings." });
    }

    const listingId = booking.listingId?._id || booking.listingId;
    if (!listingId) {
      return res.status(400).json({ message: "Listing not found for this booking." });
    }

    const reviewUserKey = mongoId || firebaseUid;

    // Handle photo uploads
    const images = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        images.push({
          url: file.path,
          key: file.filename,
        });
      }
    }

    let review = await Review.findOne({
      user: reviewUserKey,
      booking: booking._id,
    });

    if (review) {
      review.rating = Number(rating);
      review.comment = comment || "";
      review.status = "visible";
      
      // Append new images to existing ones
      if (images.length > 0) {
        review.images = [...(review.images || []), ...images];
      }
      
      await review.save();
    } else {
      review = await Review.create({
        user: reviewUserKey,
        listing: listingId,
        booking: booking._id,
        rating: Number(rating),
        comment: comment || "",
        images: images,
      });
    }

    recalcListingRating(listingId).catch(() => {});

    return res.json({
      id: review._id,
      message: "Review saved.",
      images: review.images,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "You already submitted a review for this booking.",
      });
    }

    return res.status(500).json({
      message: err.message || "Failed to submit review.",
    });
  }
};

exports.listForListing = async (req, res) => {
  try {
    const listingId = req.params.listingId || req.query.listing;
    if (!listingId) {
      return res.status(400).json({ message: "listingId is required." });
    }

    // Determine if user is admin
    const isAdmin = req.user?.role === "admin" || req.user?.isAdmin === true;
    
    // Public users can only see visible reviews
    // Admins can see all reviews based on status filter
    let statusFilter = req.query.status;
    if (!isAdmin) {
      // Force visible status for non-admin users
      statusFilter = "visible";
    } else if (!statusFilter) {
      // Default to visible for admins if not specified
      statusFilter = "visible";
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    
    // Sorting options
    const sort = req.query.sort || "recent";
    let sortQuery = {};
    
    switch (sort) {
      case "highest":
        sortQuery = { rating: -1, createdAt: -1 };
        break;
      case "lowest":
        sortQuery = { rating: 1, createdAt: -1 };
        break;
      case "recent":
      default:
        sortQuery = { createdAt: -1 };
        break;
    }

    const query = { listing: listingId };
    if (statusFilter) query.status = statusFilter;

    // Get total count for pagination
    const total = await Review.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const reviews = await Review.find(query)
      .populate("user", "name fullName firstName avatar")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const listing = await Listing.findById(listingId)
      .select("ratingAvg ratingCount rating reviewsCount ratingDistribution")
      .lean();

    const reviewCount = listing?.ratingCount ?? listing?.reviewsCount ?? total;
    const rating = listing?.ratingAvg ?? listing?.rating ?? 0;
    const distribution = listing?.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Minimum 3 reviews required to display rating publicly
    const MINIMUM_REVIEWS_THRESHOLD = 3;
    const hasMinimumReviews = reviewCount >= MINIMUM_REVIEWS_THRESHOLD;

    return res.json({
      reviews,
      rating: hasMinimumReviews ? rating : 0,
      count: reviewCount,
      distribution: distribution,
      hasMinimumReviews: hasMinimumReviews,
      minimumRequired: MINIMUM_REVIEWS_THRESHOLD,
      message: hasMinimumReviews ? null : "Not enough reviews to display rating",
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to load reviews.",
    });
  }
};

exports.myReviewedBookings = async (req, res) => {
  try {
    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userKey = mongoId || firebaseUid;

    if (!userKey) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const raw = String(req.query.bookingIds || "").trim();
    if (!raw) return res.json({ bookingIds: [] });

    const bookingIds = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!bookingIds.length) return res.json({ bookingIds: [] });

    const rows = await Review.find({
      user: userKey,
      booking: { $in: bookingIds },
      status: { $ne: "deleted" },
    })
      .select("booking")
      .lean();

    return res.json({
      bookingIds: rows.map((r) => String(r.booking)),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to load reviewed bookings.",
    });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { rating, comment, photos } = req.body;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userKey = mongoId || firebaseUid;

    if (!userKey) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check ownership
    const reviewUserId = String(review.user || review.userId || "");
    if (reviewUserId !== userKey) {
      return res.status(403).json({ message: "You can only edit your own reviews." });
    }

    // Check edit window (24 hours)
    const hoursSinceCreation = (Date.now() - review.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      return res.status(400).json({ 
        message: "Reviews can only be edited within 24 hours of submission. Please contact support if you need to make changes." 
      });
    }

    // Validate rating if provided
    if (rating !== undefined) {
      const ratingNum = Number(rating);
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5." });
      }
      review.rating = ratingNum;
    }

    // Validate comment if provided
    if (comment !== undefined) {
      const trimmedComment = String(comment).trim();
      if (trimmedComment.length < 10) {
        return res.status(400).json({ message: "Comment must be at least 10 characters." });
      }
      if (trimmedComment.length > 500) {
        return res.status(400).json({ message: "Comment must not exceed 500 characters." });
      }
      review.comment = trimmedComment;
    }

    // Handle photo uploads
    if (req.files && Array.isArray(req.files)) {
      const newImages = [];
      for (const file of req.files) {
        newImages.push({
          url: file.path,
          key: file.filename,
        });
      }
      // Append new images to existing ones
      review.images = [...(review.images || []), ...newImages];
    }

    // Handle photos array (URLs) if provided
    if (photos !== undefined && Array.isArray(photos)) {
      review.photos = photos;
    }

    // Mark as edited
    review.isEdited = true;
    review.editedAt = new Date();

    await review.save();

    // Recalculate listing rating if rating changed
    if (rating !== undefined) {
      const listingId = review.listing || review.listingId;
      if (listingId) {
        recalcListingRating(listingId).catch(() => {});
      }
    }

    return res.json({
      id: review._id,
      message: "Review updated successfully.",
      review: {
        _id: review._id,
        rating: review.rating,
        comment: review.comment,
        photos: review.photos,
        images: review.images,
        isEdited: review.isEdited,
        editedAt: review.editedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to update review.",
    });
  }
};

exports.getReview = async (req, res) => {
  try {
    const reviewId = req.params.id;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const review = await Review.findById(reviewId)
      .populate("user", "name fullName firstName avatar")
      .populate("listing", "venue shortDesc")
      .lean();

    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check visibility - non-admin users can only see visible reviews
    const isAdmin = req.user?.role === "admin" || req.user?.isAdmin === true;
    const isOwner = req.user && (
      String(review.user?._id || review.user) === String(req.user._id || req.user.id || req.user.uid)
    );

    if (!isAdmin && !isOwner && review.status !== "visible") {
      return res.status(404).json({ message: "Review not found." });
    }

    return res.json({ review });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to load review.",
    });
  }
};

exports.checkEditEligibility = async (req, res) => {
  try {
    const reviewId = req.params.id;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userKey = mongoId || firebaseUid;

    if (!userKey) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check ownership
    const reviewUserId = String(review.user || review.userId || "");
    if (reviewUserId !== userKey) {
      return res.json({ 
        eligible: false, 
        reason: "You can only edit your own reviews.",
        hoursRemaining: 0
      });
    }

    // Check edit window (24 hours)
    const hoursSinceCreation = (Date.now() - review.createdAt) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, 24 - hoursSinceCreation);
    
    if (hoursSinceCreation > 24) {
      return res.json({ 
        eligible: false, 
        reason: "Reviews can only be edited within 24 hours of submission.",
        hoursRemaining: 0
      });
    }

    return res.json({ 
      eligible: true,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to check edit eligibility.",
    });
  }
};

/**
 * Soft delete a review
 * DELETE /api/reviews/:id
 */
exports.deleteReview = async (req, res) => {
  try {
    const reviewId = req.params.id;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userKey = mongoId || firebaseUid;

    if (!userKey) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check ownership
    const reviewUserId = String(review.user || review.userId || "");
    if (reviewUserId !== userKey) {
      return res.status(403).json({ message: "You can only delete your own reviews." });
    }

    // Soft delete - set status to deleted
    review.status = "deleted";
    await review.save();

    // Recalculate listing rating
    const listingId = review.listing || review.listingId;
    if (listingId) {
      recalcListingRating(listingId).catch(() => {});
    }

    return res.json({
      message: "Review deleted successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to delete review.",
    });
  }
};

// ===== Owner Reply Endpoints =====

const OwnerReplyService = require("../services/OwnerReplyService");
const NotificationService = require("../services/NotificationService");

/**
 * Create owner reply to a review
 * POST /api/reviews/:id/reply
 */
exports.createReply = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { text } = req.body;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    if (!text) {
      return res.status(400).json({ message: "Reply text is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const ownerId = mongoId || firebaseUid;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Create the reply
    const review = await OwnerReplyService.createReply(reviewId, ownerId, text);

    // Send notification to client
    try {
      await NotificationService.notifyClientOfOwnerReply(review._id);
    } catch (notifError) {
      console.error('[Reviews] Failed to send reply notification:', notifError);
      // Don't fail the request if notification fails
    }

    return res.json({
      message: "Reply added successfully.",
      review: {
        _id: review._id,
        ownerReply: review.ownerReply,
      },
    });
  } catch (err) {
    return res.status(400).json({
      message: err.message || "Failed to add reply.",
    });
  }
};

/**
 * Update owner reply (within 24 hours)
 * PUT /api/reviews/:id/reply
 */
exports.updateReply = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { text } = req.body;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    if (!text) {
      return res.status(400).json({ message: "Reply text is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const ownerId = mongoId || firebaseUid;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Update the reply
    const review = await OwnerReplyService.updateReply(reviewId, ownerId, text);

    return res.json({
      message: "Reply updated successfully.",
      review: {
        _id: review._id,
        ownerReply: review.ownerReply,
      },
    });
  } catch (err) {
    return res.status(400).json({
      message: err.message || "Failed to update reply.",
    });
  }
};

/**
 * Get reviews for owner's listings
 * GET /api/reviews/owner/my-reviews
 */
exports.getOwnerReviews = async (req, res) => {
  try {
    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const ownerId = mongoId || firebaseUid;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const options = {
      listingId: req.query.listingId || null,
      status: req.query.status || 'visible',
      hasReply: req.query.hasReply === 'true' ? true : req.query.hasReply === 'false' ? false : null,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(50, parseInt(req.query.limit) || 20),
      sort: req.query.sort || 'recent',
    };

    const result = await OwnerReplyService.getOwnerReviews(ownerId, options);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to load owner reviews.",
    });
  }
};

// ===== Flagging System Endpoints =====

/**
 * Flag a review for moderation
 * POST /api/reviews/:id/flag
 */
exports.flagReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { reason, details } = req.body;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    if (!reason) {
      return res.status(400).json({ message: "Flag reason is required." });
    }

    // Validate reason
    const validReasons = ['spam', 'inappropriate', 'fake', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ 
        message: `Invalid flag reason. Must be one of: ${validReasons.join(', ')}` 
      });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userId = mongoId || firebaseUid;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check if already flagged
    if (review.status === 'flagged') {
      return res.status(400).json({ 
        message: "This review has already been flagged for moderation." 
      });
    }

    // Update review status to flagged
    review.status = 'flagged';
    review.flagReason = reason;
    review.flaggedBy = userId;
    review.flaggedAt = new Date();

    // Store additional details if provided
    if (details) {
      review.moderationNotes = details;
    }

    await review.save();

    // TODO: Send notification to admins
    // This will be implemented in the notification system task
    try {
      // Placeholder for admin notification
      console.log(`[Reviews] Review ${reviewId} flagged by user ${userId} for reason: ${reason}`);
    } catch (notifError) {
      console.error('[Reviews] Failed to send flag notification:', notifError);
      // Don't fail the request if notification fails
    }

    return res.json({
      message: "Review flagged successfully. Our team will review it shortly.",
      review: {
        _id: review._id,
        status: review.status,
        flagReason: review.flagReason,
        flaggedAt: review.flaggedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to flag review.",
    });
  }
};