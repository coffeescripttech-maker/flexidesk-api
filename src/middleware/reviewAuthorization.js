// src/middleware/reviewAuthorization.js
/**
 * Authorization middleware for review-related operations
 * Implements role-based access control for the review system
 */

const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");

/**
 * Helper function to extract user ID from request
 */
function getUserId(req) {
  if (!req.user) return null;
  
  // Try different ID fields
  const mongoId = req.user._id || req.user.id || req.user.userId;
  const firebaseUid = req.user.uid;
  
  // Return as string for comparison
  if (mongoId) return String(mongoId);
  if (firebaseUid) return String(firebaseUid);
  
  return null;
}

/**
 * Helper function to check if user is admin
 */
function isAdmin(req) {
  return req.user?.role === "admin" || req.user?.isAdmin === true;
}

/**
 * Middleware: Ensure user can only review their own bookings
 * Used on: POST /api/reviews/booking/:bookingId
 */
exports.canReviewBooking = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please log in to submit a review." 
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    // Extract booking user ID (handle different field names)
    const bookingUserId = String(
      booking.user || 
      booking.client || 
      booking.customer || 
      booking.clientId || 
      booking.userId || 
      ""
    );

    // Check if user owns this booking
    if (bookingUserId !== userId) {
      return res.status(403).json({ 
        message: "You can only review your own bookings." 
      });
    }

    // Store booking in request for later use
    req.booking = booking;
    next();
  } catch (err) {
    console.error("[reviewAuthorization] canReviewBooking error:", err);
    return res.status(500).json({ 
      message: "Failed to verify booking ownership." 
    });
  }
};

/**
 * Middleware: Ensure user can only edit their own reviews
 * Used on: PUT /api/reviews/:id, DELETE /api/reviews/:id
 */
exports.canEditReview = async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please log in to edit this review." 
      });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Check ownership
    const reviewUserId = String(review.user || review.userId || "");
    if (reviewUserId !== userId) {
      return res.status(403).json({ 
        message: "You can only edit your own reviews." 
      });
    }

    // Store review in request for later use
    req.review = review;
    next();
  } catch (err) {
    console.error("[reviewAuthorization] canEditReview error:", err);
    return res.status(500).json({ 
      message: "Failed to verify review ownership." 
    });
  }
};

/**
 * Middleware: Ensure owner can only reply to reviews for their listings
 * Used on: POST /api/reviews/:id/reply, PUT /api/reviews/:id/reply
 */
exports.canReplyToReview = async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please log in to reply to this review." 
      });
    }

    // Find the review with listing information
    const review = await Review.findById(reviewId).populate("listingId");
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Get the listing
    const listing = review.listingId;
    if (!listing) {
      return res.status(404).json({ 
        message: "Listing not found for this review." 
      });
    }

    // Check if user owns the listing
    const listingOwnerId = String(
      listing.owner || 
      listing.ownerId || 
      listing.host || 
      listing.hostId || 
      ""
    );

    if (listingOwnerId !== userId) {
      return res.status(403).json({ 
        message: "You can only reply to reviews for your own listings." 
      });
    }

    // Store review in request for later use
    req.review = review;
    req.listing = listing;
    next();
  } catch (err) {
    console.error("[reviewAuthorization] canReplyToReview error:", err);
    return res.status(500).json({ 
      message: "Failed to verify listing ownership." 
    });
  }
};

/**
 * Middleware: Ensure only admins can moderate reviews
 * Used on: POST /api/admin/reviews/:id/moderate, GET /api/admin/reviews/flagged
 */
exports.canModerateReviews = (req, res, next) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ 
      message: "Access denied. Admin privileges required for review moderation." 
    });
  }
  next();
};

/**
 * Middleware: Ensure user can view review (respects visibility rules)
 * Used on: GET /api/reviews/:id
 */
exports.canViewReview = async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const userId = getUserId(req);

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    // Admins can view all reviews
    if (isAdmin(req)) {
      req.review = review;
      return next();
    }

    // Review owner can view their own review regardless of status
    const reviewUserId = String(review.user || review.userId || "");
    if (userId && reviewUserId === userId) {
      req.review = review;
      return next();
    }

    // Public users can only view visible reviews
    if (review.status !== "visible") {
      return res.status(404).json({ message: "Review not found." });
    }

    req.review = review;
    next();
  } catch (err) {
    console.error("[reviewAuthorization] canViewReview error:", err);
    return res.status(500).json({ 
      message: "Failed to verify review access." 
    });
  }
};

/**
 * Middleware: Ensure user can flag reviews (authenticated users only)
 * Used on: POST /api/reviews/:id/flag
 */
exports.canFlagReview = (req, res, next) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({ 
      message: "Unauthorized. Please log in to flag reviews." 
    });
  }

  next();
};

/**
 * Middleware: Ensure owner can only access their own reviews
 * Used on: GET /api/reviews/owner/my-reviews
 */
exports.canAccessOwnerReviews = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please log in to access owner reviews." 
      });
    }

    // If a specific listing is requested, verify ownership
    if (req.query.listingId) {
      const listing = await Listing.findById(req.query.listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found." });
      }

      const listingOwnerId = String(
        listing.owner || 
        listing.ownerId || 
        listing.host || 
        listing.hostId || 
        ""
      );

      if (listingOwnerId !== userId) {
        return res.status(403).json({ 
          message: "You can only access reviews for your own listings." 
        });
      }
    }

    next();
  } catch (err) {
    console.error("[reviewAuthorization] canAccessOwnerReviews error:", err);
    return res.status(500).json({ 
      message: "Failed to verify listing ownership." 
    });
  }
};

/**
 * Middleware: Rate limiting check for review submissions
 * Prevents spam by limiting reviews per user per hour
 */
const reviewSubmissionTracker = new Map();

exports.rateLimitReviewSubmission = (req, res, next) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({ 
      message: "Unauthorized. Please log in to submit a review." 
    });
  }

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const maxReviewsPerHour = 5;

  // Get user's submission history
  if (!reviewSubmissionTracker.has(userId)) {
    reviewSubmissionTracker.set(userId, []);
  }

  const submissions = reviewSubmissionTracker.get(userId);
  
  // Remove submissions older than 1 hour
  const recentSubmissions = submissions.filter(time => now - time < oneHour);
  reviewSubmissionTracker.set(userId, recentSubmissions);

  // Check if user has exceeded limit
  if (recentSubmissions.length >= maxReviewsPerHour) {
    return res.status(429).json({ 
      message: `Rate limit exceeded. You can submit up to ${maxReviewsPerHour} reviews per hour. Please try again later.`,
      retryAfter: Math.ceil((recentSubmissions[0] + oneHour - now) / 1000) // seconds until oldest submission expires
    });
  }

  // Add current submission
  recentSubmissions.push(now);
  reviewSubmissionTracker.set(userId, recentSubmissions);

  next();
};

/**
 * Clean up old rate limit data periodically (every hour)
 */
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [userId, submissions] of reviewSubmissionTracker.entries()) {
    const recentSubmissions = submissions.filter(time => now - time < oneHour);
    if (recentSubmissions.length === 0) {
      reviewSubmissionTracker.delete(userId);
    } else {
      reviewSubmissionTracker.set(userId, recentSubmissions);
    }
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = exports;
