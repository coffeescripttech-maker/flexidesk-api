// src/admins/routes/analytics.routes.js
const express = require("express");
const router = express.Router();

const { requireAuth, requireAdmin } = require("../../middleware/auth");
const {
  getIncomeAnalytics,
  getOccupancyReport,
  getAnalyticsOverview,
  getAnalyticsForecast,
  getAnalyticsPrescriptive,
} = require("../controllers/analytics.controller");

router.get("/income", requireAuth, requireAdmin, getIncomeAnalytics);
router.get("/occupancy", requireAuth, requireAdmin, getOccupancyReport);

router.get("/overview", requireAuth, requireAdmin, getAnalyticsOverview);
router.get("/forecast", requireAuth, requireAdmin, getAnalyticsForecast);

router.get("/prescriptive", requireAuth, requireAdmin, getAnalyticsPrescriptive);

module.exports = router;
