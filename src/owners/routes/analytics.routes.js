// src/owners/analytics.route.js
const express = require("express");
const router = express.Router();

const {
  getOwnerAnalyticsSummary,
  getPredictions,
  getRecommendations,
} = require("../controllers/owner.analytics.controller");

// adjust to your actual auth middleware name/path
const { requireAuth } = require("../../middleware/auth");

router.get("/summary", requireAuth, getOwnerAnalyticsSummary);
router.get("/predictions", requireAuth, getPredictions);
router.get("/recommendations", requireAuth, getRecommendations);

module.exports = router;
