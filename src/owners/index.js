const router = require("express").Router();

router.use("/account", require("./routes/account.routes"));
router.use("/listings", require("./routes/listings.routes"));
router.use("/bookings", require("./routes/bookings.routes"));
router.use("/inquiries", require("./routes/inquiries.routes"));
router.use("/analytics", require("./routes/analytics.routes"));
router.use("/notifications", require("./routes/notifications.routes"));
router.use("/transactions", require("./routes/transactions.routes"));
router.use("/cancellation-policies", require("./routes/cancellation-policies.routes"));
router.use("/refunds", require("./routes/refunds.routes"));
router.use("/reviews", require("./routes/reviews.routes"));

module.exports = router;
