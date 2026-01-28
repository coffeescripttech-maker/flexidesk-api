const router = require("express").Router();
const ctrl = require("../controllers/listings.controller");

router.get("/search", ctrl.searchPublic);

router.get("/", ctrl.listPublic);
router.get("/:id", ctrl.getPublicById);
router.get("/:id/cancellation-policy", ctrl.getCancellationPolicy);
router.get("/:id/review-stats", ctrl.getReviewStats);

module.exports = router;
