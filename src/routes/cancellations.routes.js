/**
 * Cancellations Routes
 * Client-facing cancellation and refund endpoints
 */

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/cancellations.controller');

// Calculate refund for a booking
router.post('/bookings/:id/calculate-refund', requireAuth, ctrl.calculateRefund);

// Request cancellation for a booking
router.post('/bookings/:id/cancel', requireAuth, ctrl.cancelBooking);

// Get client's cancellation requests
router.get('/client/cancellations', requireAuth, ctrl.listClientCancellations);

// Get single cancellation request
router.get('/client/cancellations/:id', requireAuth, ctrl.getClientCancellation);

module.exports = router;
