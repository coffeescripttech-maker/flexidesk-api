// src/owners/routes/bookings.routes.js
const express = require("express");
const router = express.Router();

const {
  getOwnerBookingsMine,
  getOwnerBookingOne,
  completeOwnerBooking,
  updateOwnerBookingStatus,
} = require("../controllers/owner.bookings.controller");

const { requireAuth } = require("../../middleware/auth");

// GET /api/owner/bookings/mine
router.get("/mine", requireAuth, getOwnerBookingsMine);

router.get("/:id", requireAuth, getOwnerBookingOne);
router.post("/:id/complete", requireAuth, completeOwnerBooking);
router.patch("/:id/status", requireAuth, updateOwnerBookingStatus);

module.exports = router;
