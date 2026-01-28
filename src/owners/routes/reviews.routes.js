// src/owners/routes/reviews.routes.js
const router = require("express").Router();
const reviewsController = require("../../controllers/reviews.controller");

// Get reviews for owner's listings
router.get("/my-reviews", reviewsController.getOwnerReviews);

module.exports = router;
