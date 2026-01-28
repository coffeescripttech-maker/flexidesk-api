/**
 * Cancellations Controller
 * Handles client cancellation requests and refund calculations
 */

const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const CancellationRequest = require('../models/CancellationRequest');
const CancellationRequestService = require('../services/CancellationRequestService');
const RefundCalculator = require('../services/RefundCalculator');
const PolicyManager = require('../services/PolicyManager');

// Helper to get user ID from request
const uid = (req) => req.user?._id || req.user?.id || req.user?.uid || null;

/**
 * POST /api/bookings/:id/calculate-refund
 * Calculate refund amount for a potential cancellation
 */
async function calculateRefund(req, res, next) {
  try {
    const me = uid(req);
    if (!me) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    // Get booking
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify booking belongs to user
    if (booking.userId.toString() !== me.toString()) {
      return res.status(403).json({ message: 'Forbidden: This booking does not belong to you' });
    }

    // Get cancellation policy for the listing
    const policy = await PolicyManager.getPolicy(booking.listingId);

    // Check if cancellation is allowed
    if (!policy.allowCancellation) {
      return res.status(400).json({ 
        message: 'Cancellation is not allowed for this workspace',
        calculation: null
      });
    }

    // Calculate refund
    const calculation = RefundCalculator.calculateRefund(
      {
        amount: booking.amount,
        startDate: booking.startDate
      },
      policy,
      new Date()
    );

    return res.json({ 
      calculation,
      policy: {
        type: policy.type,
        allowCancellation: policy.allowCancellation,
        automaticRefund: policy.automaticRefund
      }
    });
  } catch (error) {
    console.error('calculateRefund error:', error);
    next(error);
  }
}

/**
 * POST /api/bookings/:id/cancel
 * Request cancellation for a booking
 */
async function cancelBooking(req, res, next) {
  try {
    const me = uid(req);
    if (!me) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const { reason, reasonOther } = req.body;

    // Validate reason
    const validReasons = ['schedule_change', 'found_alternative', 'emergency', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ 
        message: 'Invalid cancellation reason. Must be one of: schedule_change, found_alternative, emergency, other' 
      });
    }

    // If reason is "other", reasonOther is required
    if (reason === 'other' && (!reasonOther || reasonOther.trim() === '')) {
      return res.status(400).json({ 
        message: 'Please provide a reason for cancellation when selecting "other"' 
      });
    }

    // Create cancellation request
    const cancellationRequest = await CancellationRequestService.createRequest(
      id,
      me,
      reason,
      reasonOther
    );

    // Get booking with listing details for response
    const booking = await Booking.findById(id).populate('listingId', 'title venue');

    return res.status(201).json({
      message: 'Cancellation request created successfully',
      cancellationRequest,
      refundCalculation: cancellationRequest.refundCalculation,
      booking: {
        _id: booking._id,
        startDate: booking.startDate,
        endDate: booking.endDate,
        amount: booking.amount,
        listing: booking.listingId
      }
    });
  } catch (error) {
    console.error('cancelBooking error:', error);
    
    // Handle specific error messages
    if (error.message.includes('not found') || 
        error.message.includes('Unauthorized') ||
        error.message.includes('already') ||
        error.message.includes('Cannot cancel')) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
}

/**
 * GET /api/client/cancellations
 * Get all cancellation requests for the current client
 * Query params: status, bookingId, page, limit
 */
async function listClientCancellations(req, res, next) {
  try {
    const me = uid(req);
    if (!me) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { status, bookingId, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { clientId: me };
    if (status) {
      query.status = status;
    }
    if (bookingId) {
      // Validate bookingId if provided
      if (mongoose.Types.ObjectId.isValid(bookingId)) {
        query.bookingId = bookingId;
      } else {
        return res.status(400).json({ message: 'Invalid booking ID format' });
      }
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const requests = await CancellationRequest.find(query)
      .populate('listingId', 'title venue city')
      .populate('bookingId', 'startDate endDate amount')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CancellationRequest.countDocuments(query);
    const pages = Math.ceil(total / parseInt(limit));

    return res.json({
      requests,
      total,
      page: parseInt(page),
      pages
    });
  } catch (error) {
    console.error('listClientCancellations error:', error);
    next(error);
  }
}

/**
 * GET /api/client/cancellations/:id
 * Get a single cancellation request status
 */
async function getClientCancellation(req, res, next) {
  try {
    const me = uid(req);
    if (!me) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid cancellation request ID' });
    }

    // Get cancellation request
    const request = await CancellationRequest.findById(id)
      .populate('listingId', 'title venue city address')
      .populate('bookingId', 'startDate endDate amount checkInTime checkOutTime')
      .populate('ownerId', 'firstName lastName email')
      .lean();

    if (!request) {
      return res.status(404).json({ message: 'Cancellation request not found' });
    }

    // Verify request belongs to user
    if (request.clientId.toString() !== me.toString()) {
      return res.status(403).json({ message: 'Forbidden: This cancellation request does not belong to you' });
    }

    return res.json({
      request,
      booking: request.bookingId,
      listing: request.listingId
    });
  } catch (error) {
    console.error('getClientCancellation error:', error);
    next(error);
  }
}

module.exports = {
  calculateRefund,
  cancelBooking,
  listClientCancellations,
  getClientCancellation
};
