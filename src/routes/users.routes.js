const router = require("express").Router();
const requireUser = require("../middleware/requireUser");
const User = require("../models/User");
const Booking = require("../models/Booking");

// GET /api/users/me
router.get("/me", requireUser, async (req, res) => {
  const u = await User.findById(req.user.uid).select("fullName email role avatar createdAt");
  res.json({ user: u });
});

// GET /api/users/me/bookings
router.get("/me/bookings", requireUser, async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id || req.user._id;
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Find all bookings for this user
    const bookings = await Booking.find({
      $or: [
        { userId: userId },
        { user: userId },
        { client: userId },
        { customer: userId }
      ]
    })
    .populate("listingId", "venue shortDesc images dailyPrice location")
    .sort({ createdAt: -1 })
    .lean();

    res.json({ bookings });
  } catch (err) {
    console.error("[Users] Error fetching user bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

module.exports = router;
