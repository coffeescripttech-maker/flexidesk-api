// src/controllers/paymongo.controller.js
const Booking = require("../models/Booking");
const { ensureBookingQrToken } = require("./bookings.controller");
const { sendBookingEmailSafe } = require("./bookings.controller");

async function handleWebhook(req, res) {
  try {
    const event = req.body?.data;
    if (!event) return res.status(400).json({ message: "Invalid payload" });

    const type = event?.attributes?.type || "";
    if (!type.includes("payment.paid")) {
      return res.json({ ok: true, ignored: true });
    }

    const checkoutId =
      event?.attributes?.data?.id ||
      event?.attributes?.data?.attributes?.checkout_session_id;

    if (!checkoutId) {
      return res.json({ ok: true, ignored: "no checkoutId" });
    }

    const booking = await Booking.findOne({
      "payment.checkoutId": checkoutId,
      status: "pending_payment",
    });

    if (!booking) {
      return res.json({ ok: true, ignored: "no matching booking" });
    }

    booking.status = "paid";
    await ensureBookingQrToken(booking);
    await booking.save();
    await sendBookingEmailSafe(booking);

    return res.json({ ok: true });
  } catch (err) {
    console.error("PayMongo webhook error:", err);
    return res.status(500).json({ message: "Webhook error" });
  }
}

module.exports = { handleWebhook };
