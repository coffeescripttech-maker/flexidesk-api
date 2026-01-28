const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../../middleware/auth");
const { validateAdminModeration } = require("../../middleware/validateReview");
const reviewsController = require("../controllers/reviews.controller");

// Get flagged reviews for moderation
router.get("/reviews/flagged", requireAuth, requireAdmin, reviewsController.getFlaggedReviews);

// Moderate a review (approve, hide, delete)
router.post(
  "/reviews/:id/moderate",
  requireAuth,
  requireAdmin,
  validateAdminModeration,
  reviewsController.moderateReview
);

// Get review analytics
router.get("/reviews/analytics", requireAuth, requireAdmin, reviewsController.getReviewAnalytics);

module.exports = router;
