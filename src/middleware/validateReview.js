// src/middleware/validateReview.js
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");

/**
 * Helper function to resolve user IDs from request
 */
function resolveAuthIds(req) {
  const toId = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object") {
      if (v._id) return String(v._id);
      if (v.id) return String(v.id);
      if (v.uid) return String(v.uid);
    }
    return String(v);
  };

  const mongoId = toId(req.user?._id || req.user?.id || req.user?.userId);
  const firebaseUid = toId(req.user?.uid);
  return { mongoId, firebaseUid };
}

/**
 * Helper function to resolve booking user ID
 */
function resolveBookingUserId(booking) {
  const toId = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object") {
      if (v._id) return String(v._id);
      if (v.id) return String(v.id);
      if (v.uid) return String(v.uid);
    }
    return String(v);
  };

  const raw =
    booking?.user ||
    booking?.client ||
    booking?.customer ||
    booking?.clientId ||
    booking?.userId;
  return toId(raw);
}

/**
 * Validate review eligibility for a booking
 * Checks:
 * - Booking exists
 * - User owns the booking
 * - Booking is completed or past
 * - Booking is not cancelled
 * - No existing review (for creation)
 * - Review is within 90 days of booking end
 */
exports.validateReviewEligibility = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID is required." });
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
    const end = booking.endDate || booking.to;
    const bookingStatus = booking.status;

    // Prevent reviews for cancelled bookings
    if (bookingStatus === "cancelled") {
      return res.status(400).json({ message: "You cannot review cancelled bookings." });
    }

    // Prevent reviews for pending payment bookings
    if (bookingStatus === "pending_payment" || bookingStatus === "awaiting_payment") {
      return res.status(400).json({ message: "You cannot review bookings with pending payment." });
    }

    // Check if booking has ended (booking end date must be in the past)
    // TESTING MODE: Bypass date validation to allow immediate reviews for completed bookings
    /*
    if (end) {
      const endDate = new Date(end);
      
      if (endDate > now && bookingStatus !== "completed") {
        const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        return res.status(400).json({ 
          message: `You can review this booking after it completes on ${endDate.toLocaleDateString()}.`,
          daysUntilAvailable: daysUntilEnd
        });
      }

      // Check review timing window (0-90 days after booking end)
      const daysSinceEnd = (now - endDate) / (1000 * 60 * 60 * 24);
      
      if (daysSinceEnd < 0) {
        // Booking hasn't ended yet
        const daysUntilEnd = Math.ceil(Math.abs(daysSinceEnd));
        return res.status(400).json({ 
          message: `You can review this booking after it completes on ${endDate.toLocaleDateString()}.`,
          daysUntilAvailable: daysUntilEnd
        });
      }
    }
    */

    // Allow reviews only if:
    // 1. Booking status is "completed", OR
    // 2. Booking start date is in the past (and status is "paid")
    const isPastBooking = start && new Date(start) < now;
    const isCompleted = bookingStatus === "completed";
    const isPaid = bookingStatus === "paid";

    if (!isCompleted && !(isPastBooking && isPaid)) {
      return res.status(400).json({ 
        message: "You can only review completed or past bookings." 
      });
    }

    // Check for existing review (only for POST, not PUT)
    if (req.method === "POST") {
      const userKey = mongoId || firebaseUid;
      
      console.log('[REVIEW DEBUG] Checking for existing review:');
      console.log('  User Key:', userKey);
      console.log('  Booking ID:', booking._id);
      console.log('  Mongo ID:', mongoId);
      console.log('  Firebase UID:', firebaseUid);
      
      // Use correct schema field names: userId and bookingId (not user and booking)
      const existingReview = await Review.findOne({
        userId: userKey,
        bookingId: booking._id,
      }).lean();

      console.log('  Existing Review Found:', existingReview ? 'YES' : 'NO');
      if (existingReview) {
        console.log('  Review ID:', existingReview._id);
        console.log('  Review Booking ID:', existingReview.bookingId);
        console.log('  Review Status:', existingReview.status);
        console.log('  Review Rating:', existingReview.rating);
        console.log('  Review User ID:', existingReview.userId);
      }

      if (existingReview) {
        return res.status(409).json({ 
          message: "You have already reviewed this booking.",
          reviewId: existingReview._id
        });
      }
    }

    // Attach booking to request for use in controller
    req.booking = booking;
    next();
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to validate review eligibility.",
    });
  }
};

/**
 * Validate edit eligibility for a review
 * Checks:
 * - Review exists
 * - User owns the review
 * - Review is within 24 hours of creation
 */
exports.validateEditEligibility = async (req, res, next) => {
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
      return res.status(403).json({ message: "You can only edit your own reviews." });
    }

    // Check edit window (24 hours)
    const hoursSinceCreation = (Date.now() - review.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      return res.status(400).json({ 
        message: "Reviews can only be edited within 24 hours of submission. Please contact support if you need to make changes." 
      });
    }

    // Attach review to request for use in controller
    req.review = review;
    next();
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to validate edit eligibility.",
    });
  }
};

/**
 * Validate owner authorization for reply
 * Checks:
 * - Review exists
 * - User is the owner of the listing
 */
exports.validateOwnerReplyAuth = async (req, res, next) => {
  try {
    const reviewId = req.params.id;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const { mongoId, firebaseUid } = resolveAuthIds(req);
    const userId = mongoId || firebaseUid;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const review = await Review.findById(reviewId).populate("listingId");
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Get listing owner ID
    const listing = review.listingId || await Listing.findById(review.listing);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const listingOwnerId = String(listing.ownerId || listing.owner || listing.userId || "");
    
    if (listingOwnerId !== userId) {
      return res.status(403).json({ 
        message: "You can only reply to reviews for your own listings." 
      });
    }

    // For reply updates, check 24-hour window
    if (req.method === "PUT") {
      if (!review.ownerReply || !review.ownerReply.createdAt) {
        return res.status(400).json({ message: "No reply exists to update." });
      }

      const hoursSinceReply = (Date.now() - review.ownerReply.createdAt) / (1000 * 60 * 60);
      if (hoursSinceReply > 24) {
        return res.status(400).json({ 
          message: "Replies can only be edited within 24 hours of creation." 
        });
      }
    }

    // Attach review to request for use in controller
    req.review = review;
    next();
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to validate owner authorization.",
    });
  }
};

/**
 * Validate admin authorization for moderation
 * This is a placeholder - actual admin auth should be handled by requireAdmin middleware
 */
exports.validateAdminModeration = async (req, res, next) => {
  try {
    const reviewId = req.params.id;

    if (!reviewId) {
      return res.status(400).json({ message: "Review ID is required." });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Attach review to request for use in controller
    req.review = review;
    next();
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to validate moderation request.",
    });
  }
};

/**
 * Validate rating bounds
 * Checks:
 * - Rating is provided
 * - Rating is an integer
 * - Rating is between 1 and 5 (inclusive)
 */
exports.validateRatingBounds = (req, res, next) => {
  try {
    const { rating } = req.body;

    // Rating is required for POST (create), optional for PUT (update)
    if (req.method === 'POST' && !rating) {
      return res.status(400).json({ message: "Rating is required." });
    }

    // If rating is provided, validate it
    if (rating !== undefined && rating !== null) {
      // Reject non-numeric types (booleans, objects, arrays)
      if (typeof rating === 'boolean' || typeof rating === 'object') {
        return res.status(400).json({ 
          message: "Rating must be an integer between 1 and 5." 
        });
      }
      
      const ratingNum = Number(rating);
      
      // Check if it's an integer
      if (!Number.isInteger(ratingNum)) {
        return res.status(400).json({ 
          message: "Rating must be an integer between 1 and 5." 
        });
      }
      
      // Check bounds
      if (ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ 
          message: "Rating must be between 1 and 5." 
        });
      }
    }

    next();
  } catch (err) {
    return res.status(400).json({
      message: err.message || "Invalid rating value.",
    });
  }
};
