const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../../middleware/auth");
const { validateAdminModeration } = require("../../middleware/validateReview");
const reviewsController = require("../controllers/reviews.controller");

// Security middleware
const { canModerateReviews } = require("../../middleware/reviewAuthorization");
const { sanitizeModerationData } = require("../../middleware/sanitizeInput");
// Rate limiting temporarily disabled for Express 5 compatibility

// Get flagged reviews for moderation
router.get(
  "/reviews/flagged",
  requireAuth,
  requireAdmin,
  canModerateReviews,
  reviewsController.getFlaggedReviews
);

// Moderate a review (approve, hide, delete)
router.post(
  "/reviews/:id/moderate",
  requireAuth,
  requireAdmin,
  canModerateReviews,
  sanitizeModerationData,
  validateAdminModeration,
  reviewsController.moderateReview
);

// Get review analytics
router.get(
  "/reviews/analytics",
  requireAuth,
  requireAdmin,
  canModerateReviews,
  reviewsController.getReviewAnalytics
);

module.exports = router;
