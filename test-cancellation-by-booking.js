/**
 * Test script for fetching cancellation requests by bookingId
 * 
 * Usage: node test-cancellation-by-booking.js <bookingId>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const CancellationRequest = require('./src/models/CancellationRequest');

const bookingId = process.argv[2] || '69782fd0982cb9099dbee8db';

async function test() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/flexidesk');
    console.log('✓ Connected to MongoDB\n');

    console.log(`Searching for cancellation requests for booking: ${bookingId}\n`);

    // Test 1: Find by bookingId
    const requests = await CancellationRequest.find({ bookingId })
      .populate('listingId', 'title venue city')
      .populate('bookingId', 'startDate endDate amount')
      .sort({ requestedAt: -1 })
      .lean();

    console.log(`Found ${requests.length} cancellation request(s)\n`);

    if (requests.length > 0) {
      requests.forEach((req, idx) => {
        console.log(`Request ${idx + 1}:`);
        console.log(`  ID: ${req._id}`);
        console.log(`  Status: ${req.status}`);
        console.log(`  Booking ID: ${req.bookingId?._id || req.bookingId}`);
        console.log(`  Client ID: ${req.clientId}`);
        console.log(`  Owner ID: ${req.ownerId}`);
        console.log(`  Listing: ${req.listingId?.title || req.listingId}`);
        console.log(`  Reason: ${req.cancellationReason}${req.cancellationReasonOther ? ` - ${req.cancellationReasonOther}` : ''}`);
        console.log(`  Requested At: ${req.requestedAt}`);
        console.log(`  Refund Calculation:`);
        if (req.refundCalculation) {
          console.log(`    Original Amount: ₱${req.refundCalculation.originalAmount}`);
          console.log(`    Refund Percentage: ${req.refundCalculation.refundPercentage}%`);
          console.log(`    Refund Amount: ₱${req.refundCalculation.refundAmount}`);
          console.log(`    Processing Fee: ₱${req.refundCalculation.processingFee}`);
          console.log(`    Final Refund: ₱${req.refundCalculation.finalRefund}`);
          console.log(`    Hours Until Booking: ${req.refundCalculation.hoursUntilBooking}`);
        }
        console.log('');
      });
    } else {
      console.log('No cancellation requests found for this booking.');
      console.log('\nChecking if booking exists...');
      
      const Booking = require('./src/models/Booking');
      const booking = await Booking.findById(bookingId);
      
      if (booking) {
        console.log(`✓ Booking exists: ${booking._id}`);
        console.log(`  Status: ${booking.status}`);
        console.log(`  User ID: ${booking.userId}`);
        console.log(`  Listing ID: ${booking.listingId}`);
      } else {
        console.log('✗ Booking not found');
      }
    }

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test();
