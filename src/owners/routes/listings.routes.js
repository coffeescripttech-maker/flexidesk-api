const router = require("express").Router();
const requireUser = require("../../middleware/requireUser");
const { uploadListingPhotos } = require("../../middleware/uploadCloudinary");
const validateCancellationPolicy = require("../../middleware/validateCancellationPolicy");
const ctrl = require("../controllers/owner.listings.controller");

// CREATE
router.post("/", requireUser, ctrl.create);

// LIST MINE
router.get("/mine", requireUser, ctrl.listMine);

// GET ONE
router.get("/:id", requireUser, ctrl.getById);

// UPDATE FIELDS
router.put("/:id", requireUser, ctrl.update);

// UPDATE STATUS
router.patch("/:id/status", requireUser, ctrl.updateStatus);

// CANCELLATION POLICY
router.get("/:id/cancellation-policy", requireUser, ctrl.getCancellationPolicy);
router.put("/:id/cancellation-policy", requireUser, validateCancellationPolicy, ctrl.setCancellationPolicy);

// PHOTO MANAGEMENT
router.post("/:id/photos", requireUser, uploadListingPhotos.array("photos", 10), ctrl.uploadPhotos);
router.delete("/:id/photos/:index", requireUser, ctrl.deletePhoto);
router.patch("/:id/photos/cover", requireUser, ctrl.setCoverPhoto);

// DELETE
router.delete("/:id", requireUser, ctrl.remove);

module.exports = router;
