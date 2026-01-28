/**
 * RefundCalculator Service
 * Calculates refund amounts based on cancellation policy and timing
 */

class RefundCalculator {
  /**
   * Calculate refund amount for a cancellation
   * @param {Object} booking - Booking details with { amount, startDate }
   * @param {Object} policy - Cancellation policy with { tiers, processingFeePercentage }
   * @param {Date} cancellationDate - When cancellation is requested (defaults to now)
   * @returns {Object} Refund calculation breakdown
   */
  calculateRefund(booking, policy, cancellationDate = new Date()) {
    // Validate inputs
    if (!booking || !booking.amount || !booking.startDate) {
      throw new Error('Invalid booking data: amount and startDate are required');
    }

    if (!policy || !policy.tiers) {
      throw new Error('Invalid policy data: tiers are required');
    }

    // Calculate hours until booking
    const bookingStart = new Date(booking.startDate);
    const cancellationTime = new Date(cancellationDate);
    const hoursUntilBooking = (bookingStart - cancellationTime) / (1000 * 60 * 60);

    // If booking has already started or passed, no refund
    if (hoursUntilBooking <= 0) {
      return {
        originalAmount: booking.amount,
        refundPercentage: 0,
        refundAmount: 0,
        processingFee: 0,
        finalRefund: 0,
        hoursUntilBooking: hoursUntilBooking,
        tier: null,
        message: 'Booking has already started or passed. No refund available.'
      };
    }

    // Find applicable tier
    const tier = this.getApplicableTier(policy, hoursUntilBooking);

    if (!tier) {
      return {
        originalAmount: booking.amount,
        refundPercentage: 0,
        refundAmount: 0,
        processingFee: 0,
        finalRefund: 0,
        hoursUntilBooking: hoursUntilBooking,
        tier: null,
        message: 'No applicable refund tier found'
      };
    }

    // Calculate refund amount based on percentage
    const refundAmount = booking.amount * (tier.refundPercentage / 100);

    // Calculate processing fee
    const processingFee = this.calculateProcessingFee(
      refundAmount,
      policy.processingFeePercentage || 0
    );

    // Calculate final refund (refund amount minus processing fee)
    const finalRefund = Math.max(0, refundAmount - processingFee);

    return {
      originalAmount: booking.amount,
      refundPercentage: tier.refundPercentage,
      refundAmount: refundAmount,
      processingFee: processingFee,
      finalRefund: finalRefund,
      hoursUntilBooking: hoursUntilBooking,
      tier: {
        hoursBeforeBooking: tier.hoursBeforeBooking,
        refundPercentage: tier.refundPercentage,
        description: tier.description
      }
    };
  }

  /**
   * Get applicable policy tier based on timing
   * @param {Object} policy - Cancellation policy with tiers array
   * @param {number} hoursUntilBooking - Hours until booking starts
   * @returns {Object|null} Applicable tier or null if none found
   */
  getApplicableTier(policy, hoursUntilBooking) {
    if (!policy || !policy.tiers || policy.tiers.length === 0) {
      return null;
    }

    // Sort tiers by hoursBeforeBooking in descending order
    const sortedTiers = [...policy.tiers].sort(
      (a, b) => b.hoursBeforeBooking - a.hoursBeforeBooking
    );

    // Find the first tier where hoursUntilBooking >= tier.hoursBeforeBooking
    const applicableTier = sortedTiers.find(
      tier => hoursUntilBooking >= tier.hoursBeforeBooking
    );

    return applicableTier || null;
  }

  /**
   * Calculate processing fee
   * @param {number} amount - Refund amount before fees
   * @param {number} feePercentage - Fee percentage (0-100)
   * @returns {number} Fee amount
   */
  calculateProcessingFee(amount, feePercentage) {
    if (!amount || amount <= 0) {
      return 0;
    }

    if (!feePercentage || feePercentage <= 0) {
      return 0;
    }

    // Validate fee percentage is within bounds
    if (feePercentage < 0 || feePercentage > 100) {
      throw new Error(`Invalid fee percentage: ${feePercentage}%. Must be between 0 and 100`);
    }

    return amount * (feePercentage / 100);
  }
}

module.exports = new RefundCalculator();
