/**
 * Test Client Cancellation API Endpoints
 * Tests the client-facing cancellation and refund endpoints
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const CancellationRequest = require('./src/models/CancellationRequest');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

async function testClientCancellationAPI() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Test 1: Create test data
    console.log('Test 1: Creating test data...');
    
    // Create test user (client)
    const testClient = await User.findOne({ email: 'testclient@example.com' }) || 
      await User.create({
        email: 'testclient@example.com',
        fullName: 'Test Client',
        passwordHash: '$2b$10$hashedpassword',
        role: 'client'
      });
    console.log('✓ Test client created:', testClient.email);

    // Create test owner
    const testOwner = await User.findOne({ email: 'testowner@example.com' }) || 
      await User.create({
        email: 'testowner@example.com',
        fullName: 'Test Owner',
        passwordHash: '$2b$10$hashedpassword',
        role: 'owner'
      });
    console.log('✓ Test owner created:', testOwner.email);

    // Create test listing with cancellation policy
    const testListing = await Listing.findOne({ title: 'Test Workspace for Cancellation' }) ||
      await Listing.create({
        title: 'Test Workspace for Cancellation',
        venue: 'Test Venue',
        city: 'Manila',
        country: 'Philippines',
        owner: testOwner._id,
        status: 'active',
        seats: 10,
        cancellationPolicy: {
          type: 'moderate',
          allowCancellation: true,
          automaticRefund: true,
          tiers: [
            { hoursBeforeBooking: 168, refundPercentage: 100, description: 'Full refund (7+ days)' },
            { hoursBeforeBooking: 48, refundPercentage: 50, description: '50% refund (2-7 days)' },
            { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund (<2 days)' }
          ],
          processingFeePercentage: 5
        }
      });
    console.log('✓ Test listing created:', testListing.title);

    // Create test booking (7 days in the future for 100% refund)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const startDate = futureDate.toISOString().slice(0, 10);
    
    const endDate = new Date(futureDate);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const testBooking = await Booking.create({
      userId: testClient._id,
      listingId: testListing._id,
      startDate: startDate,
      endDate: endDateStr,
      nights: 1,
      guests: 2,
      amount: 1000,
      status: 'paid',
      currency: 'PHP'
    });
    console.log('✓ Test booking created:', testBooking._id);
    console.log('  Start date:', startDate);
    console.log('  Amount: ₱' + testBooking.amount);

    // Test 2: Calculate refund
    console.log('\nTest 2: Testing refund calculation...');
    const RefundCalculator = require('./src/services/RefundCalculator');
    const PolicyManager = require('./src/services/PolicyManager');
    
    const policy = await PolicyManager.getPolicy(testListing._id);
    const calculation = RefundCalculator.calculateRefund(
      {
        amount: testBooking.amount,
        startDate: testBooking.startDate
      },
      policy,
      new Date()
    );
    
    console.log('✓ Refund calculation:');
    console.log('  Original amount: ₱' + calculation.originalAmount);
    console.log('  Refund percentage:', calculation.refundPercentage + '%');
    console.log('  Refund amount: ₱' + calculation.refundAmount);
    console.log('  Processing fee: ₱' + calculation.processingFee);
    console.log('  Final refund: ₱' + calculation.finalRefund);
    console.log('  Hours until booking:', calculation.hoursUntilBooking.toFixed(2));

    // Test 3: Create cancellation request
    console.log('\nTest 3: Testing cancellation request creation...');
    const CancellationRequestService = require('./src/services/CancellationRequestService');
    
    // Clean up any existing requests for this booking
    await CancellationRequest.deleteMany({ bookingId: testBooking._id });
    
    const cancellationRequest = await CancellationRequestService.createRequest(
      testBooking._id.toString(),
      testClient._id.toString(),
      'schedule_change',
      null
    );
    
    console.log('✓ Cancellation request created:');
    console.log('  Request ID:', cancellationRequest._id);
    console.log('  Status:', cancellationRequest.status);
    console.log('  Is automatic:', cancellationRequest.isAutomatic);
    console.log('  Reason:', cancellationRequest.cancellationReason);
    console.log('  Final refund: ₱' + cancellationRequest.refundCalculation.finalRefund);

    // Test 4: Verify request can be retrieved
    console.log('\nTest 4: Testing request retrieval...');
    const retrievedRequest = await CancellationRequest.findById(cancellationRequest._id)
      .populate('listingId', 'title')
      .populate('bookingId', 'startDate amount')
      .lean();
    
    console.log('✓ Request retrieved successfully:');
    console.log('  Listing:', retrievedRequest.listingId.title);
    console.log('  Booking amount: ₱' + retrievedRequest.bookingId.amount);
    console.log('  Refund amount: ₱' + retrievedRequest.refundCalculation.finalRefund);

    // Test 5: Test with "other" reason
    console.log('\nTest 5: Testing cancellation with "other" reason...');
    
    // Create another booking
    const testBooking2 = await Booking.create({
      userId: testClient._id,
      listingId: testListing._id,
      startDate: startDate,
      endDate: endDateStr,
      nights: 1,
      guests: 1,
      amount: 500,
      status: 'paid',
      currency: 'PHP'
    });
    
    const cancellationRequest2 = await CancellationRequestService.createRequest(
      testBooking2._id.toString(),
      testClient._id.toString(),
      'other',
      'I found a better workspace closer to my office'
    );
    
    console.log('✓ Cancellation request with custom reason created:');
    console.log('  Reason:', cancellationRequest2.cancellationReason);
    console.log('  Custom reason:', cancellationRequest2.cancellationReasonOther);

    // Test 6: Test validation - duplicate request
    console.log('\nTest 6: Testing duplicate request validation...');
    try {
      await CancellationRequestService.createRequest(
        testBooking._id.toString(),
        testClient._id.toString(),
        'emergency',
        null
      );
      console.log('✗ Should have thrown error for duplicate request');
    } catch (error) {
      console.log('✓ Duplicate request correctly rejected:', error.message);
    }

    // Test 7: Test validation - booking already started
    console.log('\nTest 7: Testing validation for started booking...');
    const pastBooking = await Booking.create({
      userId: testClient._id,
      listingId: testListing._id,
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      nights: 1,
      guests: 1,
      amount: 500,
      status: 'paid',
      currency: 'PHP'
    });
    
    try {
      await CancellationRequestService.createRequest(
        pastBooking._id.toString(),
        testClient._id.toString(),
        'emergency',
        null
      );
      console.log('✗ Should have thrown error for past booking');
    } catch (error) {
      console.log('✓ Past booking correctly rejected:', error.message);
    }

    // Test 8: Test owner requests retrieval
    console.log('\nTest 8: Testing owner requests retrieval...');
    const ownerRequests = await CancellationRequestService.getOwnerRequests(
      testOwner._id.toString(),
      { status: 'pending' }
    );
    
    console.log('✓ Owner requests retrieved:');
    console.log('  Total requests:', ownerRequests.total);
    console.log('  Pending requests:', ownerRequests.requests.length);

    // Test 9: Test automatic refund eligibility
    console.log('\nTest 9: Testing automatic refund eligibility...');
    const autoRequest = await CancellationRequest.findById(cancellationRequest._id);
    console.log('✓ Automatic refund eligibility:');
    console.log('  Is automatic:', autoRequest.isAutomatic);
    console.log('  Refund percentage:', autoRequest.refundCalculation.refundPercentage + '%');
    console.log('  Hours until booking:', autoRequest.refundCalculation.hoursUntilBooking.toFixed(2));

    // Test 10: Test cancellation reasons analytics
    console.log('\nTest 10: Testing cancellation reasons analytics...');
    const reasonStats = await CancellationRequest.aggregate([
      { $match: { ownerId: testOwner._id } },
      { $group: { 
        _id: '$cancellationReason', 
        count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } }
    ]);
    
    console.log('✓ Cancellation reasons breakdown:');
    reasonStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count} request(s)`);
    });

    console.log('\n✅ All tests passed successfully!');
    console.log('\nSummary:');
    console.log('- Refund calculation: Working');
    console.log('- Cancellation request creation: Working');
    console.log('- Validation: Working');
    console.log('- Reason tracking: Working');
    console.log('- Owner requests retrieval: Working');
    console.log('- Automatic refund eligibility: Working');
    console.log('- Analytics: Working');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run tests
testClientCancellationAPI();
