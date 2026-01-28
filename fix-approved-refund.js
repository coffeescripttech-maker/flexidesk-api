/**
 * Fix approved refund that's stuck - manually complete it
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Booking = require('./src/models/Booking');
const CancellationRequest = require('./src/models/CancellationRequest');

async function fixApprovedRefund() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the approved refund
    const approvedRefund = await CancellationRequest.findOne({
      status: 'approved'
    }).populate('bookingId');

    if (!approvedRefund) {
      console.log('No approved refunds found.');
      return;
    }

    console.log(`Found approved refund: ${approvedRefund._id}`);
    console.log(`Current status: ${approvedRefund.status}`);
    console.log(`Booking has payment ID: ${approvedRefund.bookingId?.payment?.paymentId ? 'YES' : 'NO'}\n`);

    // Since there's no payment ID, mark as completed
    console.log('Marking refund as completed (no payment ID to process)...');
    
    approvedRefund.status = 'completed';
    approvedRefund.processedAt = new Date();
    approvedRefund.updatedAt = new Date();
    await approvedRefund.save();

    console.log('✅ Refund marked as completed!');
    console.log(`New status: ${approvedRefund.status}`);
    console.log(`Processed at: ${approvedRefund.processedAt}`);

    console.log('\n📝 Note: This refund was completed without PayMongo processing');
    console.log('because the booking does not have a payment.paymentId stored.');
    console.log('In production, ensure all bookings store the PayMongo payment ID.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixApprovedRefund();
