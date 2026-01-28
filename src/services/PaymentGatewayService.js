/**
 * PaymentGatewayService
 * Handles payment gateway integration for refund processing
 * Uses PayMongo as the payment provider
 */

const axios = require('axios');
const RefundTransaction = require('../models/RefundTransaction');
const CancellationRequest = require('../models/CancellationRequest');
const Booking = require('../models/Booking');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

class PaymentGatewayService {
  /**
   * Build PayMongo API client with authentication
   * @private
   * @returns {Object} Axios instance configured for PayMongo
   */
  _buildPayMongoClient() {
    if (!PAYMONGO_SECRET_KEY) {
      throw new Error('PAYMONGO_SECRET_KEY is not configured');
    }

    const basicAuth = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');

    return axios.create({
      baseURL: PAYMONGO_BASE_URL,
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Process a refund through PayMongo
   * @param {Object} refundData - Refund details
   * @param {string} refundData.cancellationRequestId - Cancellation request ID
   * @param {string} refundData.bookingId - Booking ID
   * @param {number} refundData.amount - Refund amount in PHP
   * @param {string} refundData.paymentId - PayMongo payment ID
   * @param {string} refundData.reason - Refund reason
   * @returns {Promise<Object>} Refund transaction result
   */
  async processRefund(refundData) {
    const {
      cancellationRequestId,
      bookingId,
      amount,
      paymentId,
      reason = 'requested_by_customer'
    } = refundData;

    try {
      console.log(`[PaymentGatewayService] Processing refund for booking ${bookingId}, amount: PHP ${amount}`);

      // Validate inputs
      if (!cancellationRequestId || !bookingId || !amount || !paymentId) {
        throw new Error('Missing required refund data');
      }

      // Get booking and cancellation request
      const [booking, cancellationRequest] = await Promise.all([
        Booking.findById(bookingId),
        CancellationRequest.findById(cancellationRequestId)
      ]);

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!cancellationRequest) {
        throw new Error('Cancellation request not found');
      }

      // Create refund transaction record (pending)
      const refundTransaction = await RefundTransaction.create({
        cancellationRequestId,
        bookingId,
        clientId: cancellationRequest.clientId,
        ownerId: cancellationRequest.ownerId,
        amount,
        currency: booking.currency || 'PHP',
        paymentMethod: booking.provider || 'paymongo',
        originalTransactionId: paymentId,
        status: 'pending',
        gatewayProvider: 'paymongo',
        initiatedAt: new Date()
      });

      // Convert amount to centavos (PayMongo uses centavos)
      const amountCentavos = Math.round(amount * 100);

      // Call PayMongo refund API
      const client = this._buildPayMongoClient();
      const response = await client.post('/refunds', {
        data: {
          attributes: {
            amount: amountCentavos,
            payment_id: paymentId,
            reason: reason,
            notes: `Refund for cancellation request ${cancellationRequestId}`
          }
        }
      });

      const refundData = response.data?.data;

      if (!refundData || !refundData.id) {
        throw new Error('Invalid response from payment gateway');
      }

      // Update refund transaction with success
      refundTransaction.status = 'completed';
      refundTransaction.refundTransactionId = refundData.id;
      refundTransaction.gatewayResponse = refundData;
      refundTransaction.completedAt = new Date();
      refundTransaction.updatedAt = new Date();
      await refundTransaction.save();

      // Update cancellation request status
      cancellationRequest.status = 'completed';
      cancellationRequest.processedAt = new Date();
      cancellationRequest.refundTransactionId = refundData.id;
      cancellationRequest.updatedAt = new Date();
      await cancellationRequest.save();

      // Update booking payment record
      booking.payment = booking.payment || {};
      booking.payment.refunds = booking.payment.refunds || [];
      booking.payment.refunds.push({
        refundId: refundData.id,
        amount: amount,
        status: refundData.attributes?.status || 'pending',
        createdAt: new Date()
      });
      await booking.save();

      console.log(`[PaymentGatewayService] Refund processed successfully: ${refundData.id}`);

      return {
        success: true,
        refundTransaction,
        gatewayRefundId: refundData.id,
        gatewayResponse: refundData
      };

    } catch (error) {
      console.error('[PaymentGatewayService] Refund processing failed:', error.message);

      // If we have a transaction record, update it with failure
      if (refundData.cancellationRequestId) {
        try {
          const failedTransaction = await RefundTransaction.findOne({
            cancellationRequestId: refundData.cancellationRequestId,
            status: 'pending'
          });

          if (failedTransaction) {
            failedTransaction.status = 'failed';
            failedTransaction.gatewayError = error.response?.data?.errors?.[0]?.detail || error.message;
            failedTransaction.failedAt = new Date();
            failedTransaction.updatedAt = new Date();
            await failedTransaction.save();
          }

          // Update cancellation request status
          const cancellationRequest = await CancellationRequest.findById(refundData.cancellationRequestId);
          if (cancellationRequest && cancellationRequest.status === 'processing') {
            cancellationRequest.status = 'failed';
            cancellationRequest.failureReason = error.message;
            cancellationRequest.updatedAt = new Date();
            await cancellationRequest.save();
          }
        } catch (updateError) {
          console.error('[PaymentGatewayService] Failed to update transaction status:', updateError.message);
        }
      }

      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        gatewayError: error.response?.data
      };
    }
  }

  /**
   * Check refund status with PayMongo
   * @param {string} refundTransactionId - PayMongo refund ID
   * @returns {Promise<Object>} Refund status
   */
  async checkRefundStatus(refundTransactionId) {
    try {
      console.log(`[PaymentGatewayService] Checking refund status: ${refundTransactionId}`);

      const client = this._buildPayMongoClient();
      const response = await client.get(`/refunds/${refundTransactionId}`);

      const refundData = response.data?.data;

      if (!refundData) {
        throw new Error('Refund not found');
      }

      const status = refundData.attributes?.status || 'unknown';

      // Map PayMongo status to our status
      let mappedStatus = 'processing';
      if (status === 'succeeded' || status === 'paid') {
        mappedStatus = 'completed';
      } else if (status === 'failed') {
        mappedStatus = 'failed';
      } else if (status === 'pending') {
        mappedStatus = 'processing';
      }

      return {
        success: true,
        status: mappedStatus,
        gatewayStatus: status,
        refundData
      };

    } catch (error) {
      console.error('[PaymentGatewayService] Failed to check refund status:', error.message);

      return {
        success: false,
        status: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Retry a failed refund
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Retry result
   */
  async retryRefund(cancellationRequestId) {
    try {
      console.log(`[PaymentGatewayService] Retrying refund for request: ${cancellationRequestId}`);

      // Get cancellation request
      const cancellationRequest = await CancellationRequest.findById(cancellationRequestId)
        .populate('bookingId');

      if (!cancellationRequest) {
        throw new Error('Cancellation request not found');
      }

      // Check retry count
      if (cancellationRequest.retryCount >= 3) {
        throw new Error('Maximum retry attempts reached');
      }

      // Get booking
      const booking = cancellationRequest.bookingId;
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Get payment ID
      const paymentId = booking.payment?.paymentId;
      if (!paymentId) {
        throw new Error('Payment ID not found in booking');
      }

      // Calculate refund amount (use custom amount if set, otherwise use calculated amount)
      const refundAmount = cancellationRequest.customRefundAmount !== null && 
                          cancellationRequest.customRefundAmount !== undefined
        ? cancellationRequest.customRefundAmount
        : cancellationRequest.refundCalculation?.finalRefund || 0;

      // Update retry count and timestamp
      cancellationRequest.retryCount = (cancellationRequest.retryCount || 0) + 1;
      cancellationRequest.lastRetryAt = new Date();
      cancellationRequest.status = 'processing';
      cancellationRequest.updatedAt = new Date();
      await cancellationRequest.save();

      // Process refund
      const result = await this.processRefund({
        cancellationRequestId: cancellationRequest._id,
        bookingId: booking._id,
        amount: refundAmount,
        paymentId: paymentId,
        reason: 'requested_by_customer'
      });

      return result;

    } catch (error) {
      console.error('[PaymentGatewayService] Retry refund failed:', error.message);

      // Update cancellation request with failure
      try {
        const cancellationRequest = await CancellationRequest.findById(cancellationRequestId);
        if (cancellationRequest) {
          cancellationRequest.status = 'failed';
          cancellationRequest.failureReason = error.message;
          cancellationRequest.updatedAt = new Date();
          await cancellationRequest.save();
        }
      } catch (updateError) {
        console.error('[PaymentGatewayService] Failed to update request:', updateError.message);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PaymentGatewayService();
