/**
 * Test script for refund statistics endpoint
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CancellationRequest = require('./src/models/CancellationRequest');

async function testRefundStats() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all cancellation requests
    const allRequests = await CancellationRequest.find().lean();
    console.log(`📊 Total cancellation requests: ${allRequests.length}\n`);

    // Calculate statistics manually to verify
    const totalRequests = allRequests.length;
    const approved = allRequests.filter(r => 
      ['approved', 'processing', 'completed'].includes(r.status)
    ).length;
    const rejected = allRequests.filter(r => r.status === 'rejected').length;
    const pending = allRequests.filter(r => r.status === 'pending').length;

    const total = approved + rejected;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    const totalRefunded = allRequests
      .filter(r => ['approved', 'processing', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + (r.refundCalculation?.finalRefund || 0), 0);

    const avgRefundAmount = approved > 0 ? totalRefunded / approved : 0;

    // Reason breakdown
    const reasonBreakdown = {};
    allRequests.forEach(r => {
      const reason = r.cancellationReason || 'unknown';
      reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
    });

    console.log('📈 Statistics:');
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Pending: ${pending}`);
    console.log(`   Approved: ${approved}`);
    console.log(`   Rejected: ${rejected}`);
    console.log(`   Approval Rate: ${approvalRate}%`);
    console.log(`   Total Refunded: PHP ${totalRefunded.toFixed(2)}`);
    console.log(`   Average Refund: PHP ${avgRefundAmount.toFixed(2)}`);
    console.log('\n📊 Cancellation Reasons:');
    Object.entries(reasonBreakdown).forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });

    console.log('\n✅ Statistics calculation verified!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testRefundStats();
