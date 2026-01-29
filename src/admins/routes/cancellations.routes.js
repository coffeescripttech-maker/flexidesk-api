// src/admins/routes/cancellations.routes.js
const express = require("express");
const router = express.Router();

const { requireAuth, requireAdmin } = require("../../middleware/auth");
const cancellationsController = require("../controllers/cancellations.controller");

// List all cancellation requests
router.get(
  "/cancellations",
  requireAuth,
  requireAdmin,
  cancellationsController.listCancellations
);

// Get cancellation statistics
router.get(
  "/cancellations/stats",
  requireAuth,
  requireAdmin,
  cancellationsController.getCancellationStats
);

// Get specific cancellation details
router.get(
  "/cancellations/:id",
  requireAuth,
  requireAdmin,
  cancellationsController.getCancellationDetails
);

module.exports = router;
