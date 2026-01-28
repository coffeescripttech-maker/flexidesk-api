/**
 * CancellationRequestService
 * Handles cancellation requests from clients and refund management for owners
 */

const CancellationRequest = require('../models/CancellationRequest');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const RefundCalculator = require('./RefundCalculator');
const PolicyManager = require('./PolicyManager');

class CancellationRequestService {
  /**
   * Create a cancellation request
   * @param {string} bookingId - Booking to cancel
   * @param {string} clientId - Client requesting cancellation
   * @param {string} reason - Cancellation reason
   * @param {string} reasonOther - Custom reason if "other"
   * @returns {Promise<Object>} Created cancellation request
   */
  async createRequest(bookingId, clientId, reason, reasonOther = null) {
    // Validate booking exists and belongs to client
    const booking = await Booking.findById(bookingId).populate('listingId');
    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.userId.toString() !== clientId.toString()) {
      throw new Error('Unauthorized: This booking does not belong to you');
    }

    // Validate booking status
    await this._validateBookingStatus(booking);

    // Check for duplicate requests
    const existingRequest = await CancellationRequest.findOne({
      bookingId: bookingId,
      status: { $in: ['pending', 'approved', 'processing', 'completed'] }
    });

    if (existingRequest) {
      throw new Error('A cancellation request already exists for this booking');
    }

    // Get cancellation policy
    const policy = await PolicyManager.getPolicy(booking.listingId._id);

    // Validate cancellation is allowed
    if (!policy.allowCancellation) {
      throw new Error('Cancellation is not allowed for this workspace');
    }

    // Calculate refund
    const refundCalculation = RefundCalculator.calculateRefund(
      {
        amount: booking.amount,
        startDate: booking.startDate
      },
      policy,
      new Date()
    );

    // Check if eligible for automatic refund
    const isAutomatic = this._checkAutomaticEligibility(policy, refundCalculation);

    // Get owner ID from listing
    const listing = await Listing.findById(booking.listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Create cancellation request
    const cancellationRequest = await CancellationRequest.create({
      bookingId: booking._id,
      clientId: clientId,
      ownerId: listing.owner,
      listingId: listing._id,
      requestedAt: new Date(),
      bookingStartDate: booking.startDate,
      bookingEndDate: booking.endDate,
      bookingAmount: booking.amount,
      refundCalculation: {
        originalAmount: refundCalculation.originalAmount,
        refundPercentage: refundCalculation.refundPercentage,
        refundAmount: refundCalculation.refundAmount,
        processingFee: refundCalculation.processingFee,
        finalRefund: refundCalculation.finalRefund,
        hoursUntilBooking: refundCalculation.hoursUntilBooking,
        appliedTier: refundCalculation.tier
      },
      cancellationReason: reason,
      cancellationReasonOther: reasonOther,
      status: 'pending',
      isAutomatic: isAutomatic
    });

    // Send notifications
    await this._sendCancellationNotifications(cancellationRequest, booking, listing, clientId);

    // Note: Booking status will be updated when request is approved/rejected
    // to maintain data integrity

    return cancellationRequest;
  }

  /**
   * Get cancellation requests for owner
   * @param {string} ownerId - Owner ID
   * @param {Object} filters - Filter options { status, listingId, startDate, endDate, page, limit }
   * @returns {Promise<Object>} { requests: Array, total: number, page: number, pages: number }
   */
  async getOwnerRequests(ownerId, filters = {}) {
    const {
      status,
      listingId,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = filters;

    // Build query
    const query = { ownerId: ownerId };

    if (status) {
      query.status = status;
    }

    if (listingId) {
      query.listingId = listingId;
    }

    if (startDate || endDate) {
      query.requestedAt = {};
      if (startDate) {
        query.requestedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.requestedAt.$lte = new Date(endDate);
      }
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const requests = await CancellationRequest.find(query)
      .populate('clientId', 'firstName lastName email')
      .populate('listingId', 'title')
      .populate('bookingId')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CancellationRequest.countDocuments(query);
    const pages = Math.ceil(total / limit);

    return {
      requests,
      total,
      page,
      pages
    };
  }

  /**
   * Approve a cancellation request
   * @param {string} requestId - Request ID
   * @param {string} ownerId - Owner approving
   * @param {number} customRefundAmount - Optional custom refund amount
   * @param {string} customRefundNote - Optional justification note for custom amount
   * @returns {Promise<Object>} Updated request
   */
  async approveRequest(requestId, ownerId, customRefundAmount = null, customRefundNote = null) {
    const request = await CancellationRequest.findById(requestId)
      .populate('clientId', 'email firstName lastName name')
      .populate('listingId', 'title shortDesc')
      .populate('bookingId');
      
    if (!request) {
      throw new Error('Cancellation request not found');
    }

    // Verify owner owns this listing
    if (request.ownerId.toString() !== ownerId.toString()) {
      throw new Error('Unauthorized: You do not own this listing');
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new Error(`Cannot approve request with status: ${request.status}`);
    }

    // Handle custom refund amount if provided
    if (customRefundAmount !== null && customRefundAmount !== undefined) {
      const amount = parseFloat(customRefundAmount);
      
      // Validate custom amount is within bounds
      if (isNaN(amount) || amount < 0 || amount > request.bookingAmount) {
        throw new Error('Custom refund amount must be between 0 and booking amount');
      }

      request.customRefundAmount = amount;
      request.customRefundNote = customRefundNote || '';
      
      // Update the final refund in calculation
      request.refundCalculation.finalRefund = amount;
    }

    // Update request status to approved
    request.status = 'approved';
    request.approvedBy = ownerId;
    request.approvedAt = new Date();
    request.updatedAt = new Date();

    await request.save();

    // Update booking status
    await Booking.findByIdAndUpdate(request.bookingId, {
      status: 'cancelled'
    });

    // Process refund through payment gateway
    await this._processRefundPayment(request);

    // Send approval notification to client
    await this._sendApprovalNotification(request);

    // Log approval action
    console.log(`[CancellationRequestService] Request ${requestId} approved by owner ${ownerId}`);

    return request;
  }

  /**
   * Reject a cancellation request
   * @param {string} requestId - Request ID
   * @param {string} ownerId - Owner rejecting
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Updated request
   */
  async rejectRequest(requestId, ownerId, reason) {
    if (!reason || reason.trim() === '') {
      throw new Error('Rejection reason is required');
    }

    const request = await CancellationRequest.findById(requestId)
      .populate('clientId', 'email firstName lastName name')
      .populate('listingId', 'title shortDesc')
      .populate('bookingId');
      
    if (!request) {
      throw new Error('Cancellation request not found');
    }

    // Verify owner owns this listing
    if (request.ownerId.toString() !== ownerId.toString()) {
      throw new Error('Unauthorized: You do not own this listing');
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new Error(`Cannot reject request with status: ${request.status}`);
    }

    // Update request status
    request.status = 'rejected';
    request.rejectedBy = ownerId;
    request.rejectedAt = new Date();
    request.rejectionReason = reason.trim();
    request.updatedAt = new Date();

    await request.save();

    // Restore booking status (keep it as paid/active)
    await Booking.findByIdAndUpdate(request.bookingId, {
      status: 'paid'
    });

    // Send rejection notification to client
    await this._sendRejectionNotification(request);

    // Log rejection action
    console.log(`[CancellationRequestService] Request ${requestId} rejected by owner ${ownerId}. Reason: ${reason}`);

    return request;
  }

  /**
   * Process automatic refund
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} Processing result
   */
  async processAutomaticRefund(requestId) {
    const request = await CancellationRequest.findById(requestId)
      .populate('bookingId');
      
    if (!request) {
      throw new Error('Cancellation request not found');
    }

    // Verify request is eligible for automatic processing
    if (!request.isAutomatic) {
      throw new Error('This request is not eligible for automatic refund');
    }

    // Verify request is still pending
    if (request.status !== 'pending') {
      throw new Error(`Cannot process request with status: ${request.status}`);
    }

    // Update request status to processing
    request.status = 'processing';
    request.updatedAt = new Date();
    await request.save();

    // Update booking status
    await Booking.findByIdAndUpdate(request.bookingId, {
      status: 'cancelled'
    });

    // Process refund through payment gateway
    await this._processRefundPayment(request);

    // Reload request to get updated status
    const updatedRequest = await CancellationRequest.findById(requestId);

    return {
      success: updatedRequest.status === 'completed',
      request: updatedRequest,
      message: updatedRequest.status === 'completed' 
        ? 'Automatic refund processed successfully'
        : 'Automatic refund processing initiated'
    };
  }

  /**
   * Validate booking status for cancellation
   * @private
   * @param {Object} booking - Booking document
   * @throws {Error} If booking cannot be cancelled
   */
  async _validateBookingStatus(booking) {
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      throw new Error('This booking has already been cancelled');
    }

    // Check if booking is completed
    if (booking.status === 'completed') {
      throw new Error('Cannot cancel a completed booking');
    }

    // Check if booking has already started
    const now = new Date();
    const bookingStart = new Date(booking.startDate);

    if (bookingStart <= now) {
      throw new Error('Cannot cancel a booking that has already started. Please contact the workspace owner directly.');
    }

    // Check if booking is in a valid state for cancellation
    const validStatuses = ['paid', 'pending_payment', 'awaiting_payment'];
    if (!validStatuses.includes(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`);
    }
  }

  /**
   * Check if request is eligible for automatic refund
   * @private
   * @param {Object} policy - Cancellation policy
   * @param {Object} refundCalculation - Refund calculation result
   * @returns {boolean} True if eligible for automatic refund
   */
  _checkAutomaticEligibility(policy, refundCalculation) {
    // Check if policy allows automatic refunds
    if (!policy.automaticRefund) {
      return false;
    }

    // Check if refund is 100%
    if (refundCalculation.refundPercentage !== 100) {
      return false;
    }

    // Check if cancellation is more than 24 hours before booking
    if (refundCalculation.hoursUntilBooking < 24) {
      return false;
    }

    return true;
  }

  /**
   * Send cancellation notifications to client and owner
   * @private
   * @param {Object} cancellationRequest - Cancellation request document
   * @param {Object} booking - Booking document
   * @param {Object} listing - Listing document
   * @param {string} clientId - Client ID
   */
  async _sendCancellationNotifications(cancellationRequest, booking, listing, clientId) {
    try {
      const NotificationService = require('./NotificationService');

      // Send confirmation email to client
      await NotificationService.sendCancellationConfirmation(cancellationRequest._id);

      // Send notification to owner (unless it's automatic)
      if (!cancellationRequest.isAutomatic) {
        await NotificationService.sendRefundRequestNotification(cancellationRequest._id);
      } else {
        // For automatic refunds, notify owner that it was processed automatically
        await NotificationService.sendAutomaticRefundProcessed(cancellationRequest._id);
      }
    } catch (error) {
      // Log error but don't fail the request creation
      console.error('Failed to send cancellation notifications:', error);
    }
  }

  /**
   * Send approval notification to client
   * @private
   * @param {Object} cancellationRequest - Cancellation request document (populated)
   */
  async _sendApprovalNotification(cancellationRequest) {
    try {
      const NotificationService = require('./NotificationService');
      await NotificationService.sendRefundApproved(cancellationRequest._id);
    } catch (error) {
      // Log error but don't fail the approval
      console.error('Failed to send approval notification:', error);
    }
  }

  /**
   * Send rejection notification to client
   * @private
   * @param {Object} cancellationRequest - Cancellation request document (populated)
   */
  async _sendRejectionNotification(cancellationRequest) {
    try {
      const NotificationService = require('./NotificationService');
      await NotificationService.sendRefundRejected(cancellationRequest._id);
    } catch (error) {
      // Log error but don't fail the rejection
      console.error('Failed to send rejection notification:', error);
    }
  }

  /**
   * Process refund payment through payment gateway
   * @private
   * @param {Object} cancellationRequest - Cancellation request document (populated)
   */
  async _processRefundPayment(cancellationRequest) {
    try {
      const PaymentGatewayService = require('./PaymentGatewayService');
      
      const booking = cancellationRequest.bookingId;
      
      // Check if booking has payment ID
      const paymentId = booking?.payment?.paymentId;
      
      if (!paymentId) {
        console.warn(`[CancellationRequestService] No payment ID found for booking ${booking?._id}. Skipping payment gateway refund.`);
        // Mark as completed anyway since approval is done
        cancellationRequest.status = 'completed';
        cancellationRequest.processedAt = new Date();
        cancellationRequest.updatedAt = new Date();
        await cancellationRequest.save();
        return;
      }

      // Calculate refund amount
      const refundAmount = cancellationRequest.customRefundAmount !== null && 
                          cancellationRequest.customRefundAmount !== undefined
        ? cancellationRequest.customRefundAmount
        : cancellationRequest.refundCalculation?.finalRefund || 0;

      // Update status to processing
      cancellationRequest.status = 'processing';
      cancellationRequest.updatedAt = new Date();
      await cancellationRequest.save();

      // Process refund through payment gateway
      const result = await PaymentGatewayService.processRefund({
        cancellationRequestId: cancellationRequest._id,
        bookingId: booking._id,
        amount: refundAmount,
        paymentId: paymentId,
        reason: 'requested_by_customer'
      });

      if (result.success) {
        console.log(`[CancellationRequestService] Refund processed successfully for request ${cancellationRequest._id}`);
      } else {
        console.error(`[CancellationRequestService] Refund processing failed for request ${cancellationRequest._id}:`, result.error);
        // The PaymentGatewayService already updated the status to 'failed'
      }

    } catch (error) {
      console.error('[CancellationRequestService] Error processing refund payment:', error);
      
      // Update request status to failed
      cancellationRequest.status = 'failed';
      cancellationRequest.failureReason = error.message;
      cancellationRequest.updatedAt = new Date();
      await cancellationRequest.save();
    }
  }
}

module.exports = new CancellationRequestService();
