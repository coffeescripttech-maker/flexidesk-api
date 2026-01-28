/**
 * Check the status of approved refunds
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const CancellationRequest = require('./src/models/CancellationRequest');
const RefundTransaction = require('./src/models/RefundTransaction');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');

async function checkRefundStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find approved refunds
    const approvedRequests = await CancellationRequest.find({
      status: { $in: ['approved', 'processing', 'completed', 'failed'] }
    })
      .populate('clientId', 'fullName email')
      .populate('listingId', 'title shortDesc')
      .populate('bookingId')
      .sort({ approvedAt: -1 })
      .limit(5);

    console.log('📊 Recent Approved/Processed Refunds:\n');

    if (approvedRequests.length === 0) {
      console.log('   No approved refunds found.');
    } else {
      for (const req of approvedRequests) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Request ID: ${req._id}`);
        console.log(`Status: ${req.status.toUpperCase()}`);
        console.log(`Client: ${req.clientId?.fullName || 'Unknown'}`);
        console.log(`Listing: ${req.listingId?.title || req.listingId?.shortDesc || 'Unknown'}`);
        console.log(`Refund Amount: PHP ${req.refundCalculation?.finalRefund || 0}`);
        console.log(`Approved At: ${req.approvedAt ? new Date(req.approvedAt).toLocaleString() : 'N/A'}`);
        
        if (req.status === 'processing') {
          console.log(`⏳ Status: PROCESSING - Refund is being processed through PayMongo`);
        } else if (req.status === 'completed') {
          console.log(`✅ Status: COMPLETED - Refund successfully processed`);
          if (req.refundTransactionId) {
            console.log(`   PayMongo Refund ID: ${req.refundTransactionId}`);
          }
        } else if (req.status === 'failed') {
          console.log(`❌ Status: FAILED - Refund processing failed`);
          if (req.failureReason) {
            console.log(`   Reason: ${req.failureReason}`);
          }
          console.log(`   Retry Count: ${req.retryCount || 0}/3`);
        } else if (req.status === 'approved') {
          console.log(`✓ Status: APPROVED - Waiting for payment processing`);
        }

        // Check for RefundTransaction
        const refundTxn = await RefundTransaction.findOne({
          cancellationRequestId: req._id
        });

        if (refundTxn) {
          console.log(`\n💳 Refund Transaction:`);
          console.log(`   Transaction ID: ${refundTxn._id}`);
          console.log(`   Status: ${refundTxn.status}`);
          console.log(`   Amount: PHP ${refundTxn.amount}`);
          console.log(`   Gateway: ${refundTxn.gatewayProvider}`);
          if (refundTxn.refundTransactionId) {
            console.log(`   PayMongo Refund ID: ${refundTxn.refundTransactionId}`);
          }
          if (refundTxn.gatewayError) {
            console.log(`   Error: ${refundTxn.gatewayError}`);
          }
        } else {
          console.log(`\n⚠️  No RefundTransaction found`);
        }

        // Check booking payment info
        const booking = req.bookingId;
        if (booking) {
          console.log(`\n📦 Booking Info:`);
          console.log(`   Booking ID: ${booking._id}`);
          console.log(`   Status: ${booking.status}`);
          console.log(`   Payment ID: ${booking.payment?.paymentId || 'NOT FOUND'}`);
          
          if (!booking.payment?.paymentId) {
            console.log(`   ⚠️  WARNING: No payment ID found - refund cannot be processed through PayMongo`);
          }
          
          if (booking.payment?.refunds && booking.payment.refunds.length > 0) {
            console.log(`   Refunds: ${booking.payment.refunds.length} refund(s) recorded`);
            booking.payment.refunds.forEach((r, i) => {
              console.log(`     ${i + 1}. Amount: PHP ${r.amount}, Status: ${r.status}`);
            });
          }
        }

        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Summary
    const statusCounts = await CancellationRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('📈 Status Summary:');
    statusCounts.forEach(s => {
      console.log(`   ${s._id}: ${s.count}`);
    });

    console.log('\n📝 What Happens After Approval:\n');
    console.log('1. Status changes to "approved"');
    console.log('2. System calls _processRefundPayment()');
    console.log('3. Status changes to "processing"');
    console.log('4. RefundTransaction is created (pending)');
    console.log('5. PayMongo API is called to process refund');
    console.log('6. If successful:');
    console.log('   - RefundTransaction status → completed');
    console.log('   - CancellationRequest status → completed');
    console.log('   - Booking.payment.refunds[] is updated');
    console.log('   - Client receives approval email');
    console.log('7. If failed:');
    console.log('   - RefundTransaction status → failed');
    console.log('   - CancellationRequest status → failed');
    console.log('   - System will retry up to 3 times');
    console.log('   - After 3 failures, flagged for manual processing');

    console.log('\n⚠️  IMPORTANT NOTE:');
    console.log('If the booking does not have a payment.paymentId, the refund');
    console.log('will be marked as completed WITHOUT calling PayMongo API.');
    console.log('This is because we need the PayMongo payment ID to process refunds.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkRefundStatus();
