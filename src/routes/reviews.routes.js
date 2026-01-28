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
} = require("../middleware/validateReview");

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
  validateReviewEligibility,
  uploadReviewPhotos.array("photos", 5),
  reviewsController.createForBooking
);

router.get("/my-reviewed-bookings", requireUser, reviewsController.myReviewedBookings);

// ----- Protected: get single review -----
router.get("/:id", requireUser, reviewsController.getReview);

// ----- Protected: check edit eligibility -----
router.get("/:id/edit-eligibility", requireUser, reviewsController.checkEditEligibility);

// ----- Protected: update review (within 24 hours) -----
// Frontend call: PUT /reviews/:id
// Supports up to 5 photo uploads
router.put(
  "/:id",
  requireUser,
  validateEditEligibility,
  uploadReviewPhotos.array("photos", 5),
  reviewsController.updateReview
);

// ----- Protected: delete review (soft delete) -----
// Frontend call: DELETE /reviews/:id
router.delete("/:id", requireUser, reviewsController.deleteReview);

// ----- Owner Reply Endpoints -----

// Get reviews for owner's listings
// GET /api/reviews/owner/my-reviews
router.get("/owner/my-reviews", requireUser, reviewsController.getOwnerReviews);

// Create reply to review
// POST /api/reviews/:id/reply
router.post(
  "/:id/reply",
  requireUser,
  validateOwnerReplyAuth,
  reviewsController.createReply
);

// Update reply (within 24 hours)
// PUT /api/reviews/:id/reply
router.put(
  "/:id/reply",
  requireUser,
  validateOwnerReplyAuth,
  reviewsController.updateReply
);

// ----- Flagging System Endpoints -----

// Flag a review for moderation
// POST /api/reviews/:id/flag
router.post("/:id/flag", requireUser, reviewsController.flagReview);

module.exports = router;
