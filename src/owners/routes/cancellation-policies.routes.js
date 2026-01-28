const router = require("express").Router();
const requireUser = require("../../middleware/requireUser");
const ctrl = require("../controllers/owner.listings.controller");

// GET POLICY TEMPLATES
router.get("/templates", requireUser, ctrl.getPolicyTemplates);

module.exports = router;
