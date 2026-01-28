/**
 * Verify Cancellation Request Saved
 * Check if cancellation request was created for a specific booking
 * 
 * Usage: node verify-cancellation-saved.js <bookingId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CancellationRequest = require('./src/models/CancellationRequest');
const Booking = require('./src/models/Booking');

const bookingId = process.argv[2] || '69783f63a3582057d08681e8';

async function verifyCancellation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get the booking
    const booking = await Booking.findById(bookingId)
      .populate('listingId', 'title venue')
      .lean();

    if (!booking) {
      console.log('❌ Booking not found');
      process.exit(1);
    }

    console.log('📋 Booking Details:');
    console.log('  ID:', booking._id);
    console.log('  Status:', booking.status);
    console.log('  Amount:', `₱${booking.amount}`);
    console.log('  Dates:', booking.startDate, 'to', booking.endDate);
    console.log('  Listing:', booking.listingId?.title || 'N/A');
    console.log('');

    // Find cancellation request
    const cancellationRequest = await CancellationRequest.findOne({ bookingId })
      .populate('clientId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('listingId', 'title venue')
      .lean();

    if (!cancellationRequest) {
      console.log('❌ No cancellation request found for this booking');
      console.log('');
      console.log('This means the old cancel endpoint was used.');
      console.log('Please restart the backend server and try cancelling again.');
      process.exit(1);
    }

    console.log('✅ Cancellation Request Found!\n');
    console.log('📄 Cancellation Request Details:');
    console.log('  ID:', cancellationRequest._id);
    console.log('  Status:', cancellationRequest.status);
    console.log('  Requested At:', cancellationRequest.requestedAt);
    console.log('  Is Automatic:', cancellationRequest.isAutomatic);
    console.log('');

    console.log('👤 Client:', cancellationRequest.clientId?.email || 'N/A');
    console.log('🏢 Owner:', cancellationRequest.ownerId?.email || 'N/A');
    console.log('🏠 Listing:', cancellationRequest.listingId?.title || 'N/A');
    console.log('');

    console.log('💰 Refund Calculation:');
    console.log('  Original Amount:', `₱${cancellationRequest.refundCalculation.originalAmount}`);
    console.log('  Refund Percentage:', `${cancellationRequest.refundCalculation.refundPercentage}%`);
    console.log('  Refund Amount:', `₱${cancellationRequest.refundCalculation.refundAmount}`);
    console.log('  Processing Fee:', `₱${cancellationRequest.refundCalculation.processingFee}`);
    console.log('  Final Refund:', `₱${cancellationRequest.refundCalculation.finalRefund}`);
    console.log('  Hours Until Booking:', cancellationRequest.refundCalculation.hoursUntilBooking);
    console.log('');

    console.log('📝 Cancellation Reason:', cancellationRequest.cancellationReason);
    if (cancellationRequest.cancellationReasonOther) {
      console.log('  Details:', cancellationRequest.cancellationReasonOther);
    }
    console.log('');

    console.log('✅ All data saved correctly!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Log in as the owner');
    console.log('2. Navigate to /owner/refunds');
    console.log('3. You should see this cancellation request');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyCancellation();
