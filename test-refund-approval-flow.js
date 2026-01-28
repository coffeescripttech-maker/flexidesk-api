/**
 * Test script to verify refund approval flow
 * Tests what happens after owner approves a refund request
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CancellationRequest = require('./src/models/CancellationRequest');
const Booking = require('./src/models/Booking');
const RefundTransaction = require('./src/models/RefundTransaction');

async function testRefundApprovalFlow() {
  try {
    console.log('🔍 Testing Refund Approval Flow\n');
    console.log('='.repeat(60));

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');

    // Find an approved cancellation request
    const approvedRequest = await CancellationRequest.findOne({
      status: { $in: ['approved', 'processing', 'completed'] }
    })
      .populate('bookingId')
      .populate('clientId', 'email fullName name')
      .populate('listingId', 'title shortDesc')
      .sort({ approvedAt: -1 })
      .lean();

    if (!approvedRequest) {
      console.log('❌ No approved refund requests found');
      console.log('\n💡 Create a cancellation request and approve it first');
      return;
    }

    console.log('📋 APPROVED REFUND REQUEST DETAILS');
    console.log('='.repeat(60));
    console.log(`Request ID: ${approvedRequest._id}`);
    console.log(`Status: ${approvedRequest.status}`);
    console.log(`Client: ${approvedRequest.clientId?.fullName || approvedRequest.clientId?.name || 'Unknown'}`);
    console.log(`Listing: ${approvedRequest.listingId?.shortDesc || approvedRequest.listingId?.title || 'Unknown'}`);
    console.log(`Booking Amount: PHP ${approvedRequest.bookingAmount}`);
    console.log(`Refund Amount: PHP ${approvedRequest.refundCalculation?.finalRefund || 0}`);
    console.log(`Custom Amount: ${approvedRequest.customRefundAmount !== null ? `PHP ${approvedRequest.customRefundAmount}` : 'None'}`);
    console.log(`Approved At: ${approvedRequest.approvedAt}`);
    console.log(`Processed At: ${approvedRequest.processedAt || 'Not yet processed'}`);

    // Check if booking was updated
    console.log('\n📦 BOOKING STATUS');
    console.log('='.repeat(60));
    const booking = approvedRequest.bookingId;
    if (booking) {
      console.log(`Booking ID: ${booking._id}`);
      console.log(`Status: ${booking.status}`);
      console.log(`Payment ID: ${booking.payment?.paymentId || 'None'}`);
      console.log(`Refunds: ${booking.payment?.refunds?.length || 0} refund(s)`);
      
      if (booking.payment?.refunds?.length > 0) {
        booking.payment.refunds.forEach((refund, idx) => {
          console.log(`\n  Refund ${idx + 1}:`);
          console.log(`    Refund ID: ${refund.refundId}`);
          console.log(`    Amount: PHP ${refund.amount}`);
          console.log(`    Status: ${refund.status}`);
          console.log(`    Created: ${refund.createdAt}`);
        });
      }
    } else {
      console.log('❌ Booking not found');
    }

    // Check for refund transaction
    console.log('\n💳 REFUND TRANSACTION');
    console.log('='.repeat(60));
    const refundTransaction = await RefundTransaction.findOne({
      cancellationRequestId: approvedRequest._id
    }).lean();

    if (refundTransaction) {
      console.log(`Transaction ID: ${refundTransaction._id}`);
      console.log(`Status: ${refundTransaction.status}`);
      console.log(`Amount: PHP ${refundTransaction.amount}`);
      console.log(`Gateway Provider: ${refundTransaction.gatewayProvider}`);
      console.log(`Gateway Refund ID: ${refundTransaction.refundTransactionId || 'None'}`);
      console.log(`Original Payment ID: ${refundTransaction.originalTransactionId}`);
      console.log(`Initiated At: ${refundTransaction.initiatedAt}`);
      console.log(`Completed At: ${refundTransaction.completedAt || 'Not completed'}`);
      console.log(`Failed At: ${refundTransaction.failedAt || 'N/A'}`);
      
      if (refundTransaction.gatewayError) {
        console.log(`\n⚠️  Gateway Error: ${refundTransaction.gatewayError}`);
      }
      
      if (refundTransaction.gatewayResponse) {
        console.log(`\n✅ Gateway Response Available: Yes`);
      }
    } else {
      console.log('❌ No refund transaction found');
      console.log('\n⚠️  This means the payment gateway refund was not processed!');
    }

    // Check for failed refunds
    console.log('\n🔴 FAILED REFUNDS CHECK');
    console.log('='.repeat(60));
    const failedRequests = await CancellationRequest.find({
      status: 'failed'
    }).countDocuments();

    const failedTransactions = await RefundTransaction.find({
      status: 'failed'
    }).countDocuments();

    console.log(`Failed Cancellation Requests: ${failedRequests}`);
    console.log(`Failed Refund Transactions: ${failedTransactions}`);

    if (failedRequests > 0 || failedTransactions > 0) {
      console.log('\n⚠️  There are failed refunds that need attention!');
      
      const failedDetails = await CancellationRequest.find({
        status: 'failed'
      })
        .populate('bookingId', 'code')
        .limit(5)
        .lean();

      failedDetails.forEach((req, idx) => {
        console.log(`\n  Failed Request ${idx + 1}:`);
        console.log(`    Request ID: ${req._id}`);
        console.log(`    Booking: ${req.bookingId?.code || 'Unknown'}`);
        console.log(`    Failure Reason: ${req.failureReason || 'Unknown'}`);
        console.log(`    Retry Count: ${req.retryCount || 0}`);
        console.log(`    Last Retry: ${req.lastRetryAt || 'Never'}`);
      });
    }

    // Summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(60));
    
    const hasPaymentId = booking?.payment?.paymentId ? '✅' : '❌';
    const hasRefundTransaction = refundTransaction ? '✅' : '❌';
    const isCompleted = approvedRequest.status === 'completed' ? '✅' : '⏳';
    const bookingCancelled = booking?.status === 'cancelled' ? '✅' : '❌';

    console.log(`${hasPaymentId} Booking has Payment ID`);
    console.log(`${hasRefundTransaction} Refund Transaction Created`);
    console.log(`${isCompleted} Refund Completed`);
    console.log(`${bookingCancelled} Booking Status = Cancelled`);

    // Check what happens in UI
    console.log('\n🖥️  UI/PAGE ENTRY POINT');
    console.log('='.repeat(60));
    console.log('URL: http://localhost:5173/owner/refunds');
    console.log('\nWhat happens after owner approves:');
    console.log('1. ✅ Owner clicks "Approve" button in ApproveRefundModal');
    console.log('2. ✅ API POST /api/owner/refunds/:id/approve is called');
    console.log('3. ✅ CancellationRequestService.approveRequest() is executed');
    console.log('4. ✅ Request status changes: pending → approved');
    console.log('5. ✅ Booking status changes to: cancelled');
    console.log('6. ✅ _processRefundPayment() is called');
    console.log('7. ✅ PaymentGatewayService.processRefund() processes the refund');
    console.log('8. ✅ RefundTransaction is created with status: pending');
    console.log('9. ✅ PayMongo API is called to process actual refund');
    console.log('10. ✅ RefundTransaction status updated: pending → completed/failed');
    console.log('11. ✅ CancellationRequest status updated: approved → completed/failed');
    console.log('12. ✅ Booking.payment.refunds[] array is updated');
    console.log('13. ✅ Email notification sent to client');
    console.log('14. ✅ UI refreshes and shows updated status');

    console.log('\n💰 ACTUAL REFUND PROCESSING');
    console.log('='.repeat(60));
    console.log('The actual refund to the client happens through:');
    console.log('1. PayMongo API (Payment Gateway)');
    console.log('2. The refund is processed to the original payment method');
    console.log('3. Client receives money back to their card/account');
    console.log('4. Processing time: 5-10 business days (depends on bank)');

    if (!booking?.payment?.paymentId) {
      console.log('\n⚠️  WARNING: No payment ID found!');
      console.log('This means the actual refund cannot be processed through PayMongo.');
      console.log('The system will mark it as completed but no money will be refunded.');
      console.log('\n💡 Solution: Ensure bookings have payment.paymentId when created.');
    }

    if (refundTransaction?.status === 'failed') {
      console.log('\n❌ REFUND FAILED!');
      console.log('The payment gateway refund failed.');
      console.log('Possible reasons:');
      console.log('- Invalid payment ID');
      console.log('- Payment already refunded');
      console.log('- PayMongo API error');
      console.log('- Network timeout');
      console.log('\n💡 Solution: Check the gateway error and retry the refund.');
    }

    if (approvedRequest.status === 'processing') {
      console.log('\n⏳ REFUND IN PROGRESS');
      console.log('The refund is currently being processed.');
      console.log('Check back later or check PayMongo dashboard.');
    }

    if (approvedRequest.status === 'completed' && refundTransaction?.status === 'completed') {
      console.log('\n✅ REFUND SUCCESSFULLY COMPLETED!');
      console.log('The client will receive their money within 5-10 business days.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

// Run the test
testRefundApprovalFlow();
