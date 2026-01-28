// src/routes/cases.routes.js
const router = require("express").Router();
const protect = require("../middleware/auth");
const { getMyCasesByBookingIds } = require("../controllers/cases.controller");

router.get("/by-bookings", protect, getMyCasesByBookingIds);

module.exports = router;