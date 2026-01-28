// src/routes/paymongo.routes.js
const router = require("express").Router();
const { handleWebhook } = require("../controllers/paymongo.controller");

router.post("/webhook", handleWebhook);

module.exports = router;
