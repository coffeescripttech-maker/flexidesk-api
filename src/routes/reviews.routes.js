// src/routes/reviews.routes.js
const express = require("express");
const router = express.Router();

const reviewsController = require("../controllers/reviews.controller");
const requireUser = require("../middleware/requireUser");
const { uploadReviewPhotos } = require("../middleware/uploadCloudinary");
const {
  validateReviewEligibility,
  validateEditEligibility,
  validateOwnerReplyAuth,
  validateRatingBounds,
} = require("../middleware/validateReview");

// Security middleware
const {
  canReviewBooking,
  canEditReview,
  canReplyToReview,
  canViewReview,
  canFlagReview,
  canAccessOwnerReviews,
} = require("../middleware/reviewAuthorization");

const {
  sanitizeReviewData,
  sanitizeReplyData,
  sanitizeFlagData,
  sanitizePhotoUpload,
} = require("../middleware/sanitizeInput");

// Rate limiting temporarily disabled for Express 5 compatibility
// const { ... } = require("../middleware/rateLimiting");

// Apply logging to all review routes (rate limiting temporarily disabled for Express 5 compatibility)
// router.use(logRateLimitHit);
// Note: Rate limiters temporarily disabled due to Express 5 compatibility issues
// TODO: Upgrade express-rate-limit to v7+ for Express 5 support

// ----- Public: list reviews for a listing -----
// Frontend call: GET /reviews?listing=<id>&status=visible
router.get("/", reviewsController.listForListing);

// ----- Public: legacy /listing/:listingId path -----
router.get("/listing/:listingId", reviewsController.listForListing);

// ----- Protected: create or update review for a booking -----
// Frontend call: POST /reviews/booking/:bookingId
// Supports up to 5 photo uploads
router.post(
  "/booking/:bookingId",
  requireUser,
  canReviewBooking,
  uploadReviewPhotos.array("photos", 5), // Parse FormData FIRST
  validateReviewEligibility,
  validateRatingBounds, // Then validate the parsed data
  sanitizePhotoUpload,
  sanitizeReviewData,
  reviewsController.createForBooking
);

router.get("/my-reviewed-bookings", requireUser, reviewsController.myReviewedBookings);

// ----- Protected: get single review -----
router.get("/:id", requireUser, canViewReview, reviewsController.getReview);

// ----- Protected: check edit eligibility -----
router.get("/:id/edit-eligibility", requireUser, reviewsController.checkEditEligibility);

// ----- Protected: update review (within 24 hours) -----
// Frontend call: PUT /reviews/:id
// Supports up to 5 photo uploads
router.put(
  "/:id",
  requireUser,
  canEditReview,
  uploadReviewPhotos.array("photos", 5), // Parse FormData FIRST
  validateEditEligibility,
  validateRatingBounds, // Then validate the parsed data
  sanitizePhotoUpload,
  sanitizeReviewData,
  reviewsController.updateReview
);

// ----- Protected: delete review (soft delete) -----
// Frontend call: DELETE /reviews/:id
router.delete("/:id", requireUser, canEditReview, reviewsController.deleteReview);

// ----- Owner Reply Endpoints -----

// Get reviews for owner's listings
// GET /api/reviews/owner/my-reviews
router.get("/owner/my-reviews", requireUser, canAccessOwnerReviews, reviewsController.getOwnerReviews);

// Create reply to review
// POST /api/reviews/:id/reply
router.post(
  "/:id/reply",
  requireUser,
  canReplyToReview,
  validateOwnerReplyAuth,
  sanitizeReplyData,
  reviewsController.createReply
);

// Update reply (within 24 hours)
// PUT /api/reviews/:id/reply
router.put(
  "/:id/reply",
  requireUser,
  canReplyToReview,
  validateOwnerReplyAuth,
  sanitizeReplyData,
  reviewsController.updateReply
);

// ----- Flagging System Endpoints -----

// Flag a review for moderation
// POST /api/reviews/:id/flag
router.post(
  "/:id/flag",
  requireUser,
  canFlagReview,
  sanitizeFlagData,
  reviewsController.flagReview
);

module.exports = router;
