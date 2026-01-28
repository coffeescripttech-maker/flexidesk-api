/**
 * Test script for CancellationRequestService
 * Run with: node test-cancellation-request-service.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CancellationRequestService = require('./src/services/CancellationRequestService');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const CancellationRequest = require('./src/models/CancellationRequest');

async function testCancellationRequestService() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to database');

    // Clean up test data
    await CancellationRequest.deleteMany({ 
      cancellationReason: 'schedule_change',
      cancellationReasonOther: 'Test cancellation'
    });

    // Find a test user (client)
    const client = await User.findOne({ role: 'client' });
    if (!client) {
      console.log('✗ No client user found. Please create a client user first.');
      return;
    }
    console.log(`✓ Found client: ${client.firstName} ${client.lastName}`);

    // Find a test listing with cancellation policy
    const listing = await Listing.findOne({ 
      'cancellationPolicy.type': { $exists: true }
    });
    if (!listing) {
      console.log('✗ No listing with cancellation policy found.');
      return;
    }
    console.log(`✓ Found listing: ${listing.title}`);
    console.log(`  Policy type: ${listing.cancellationPolicy?.type || 'none'}`);

    // Create a test booking
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

    const booking = await Booking.create({
      userId: client._id,
      listingId: listing._id,
      startDate: futureDate.toISOString().split('T')[0],
      endDate: futureDate.toISOString().split('T')[0],
      nights: 1,
      guests: 1,
      amount: 1000,
      status: 'paid'
    });
    console.log(`✓ Created test booking: ${booking._id}`);

    // Test 1: Create cancellation request
    console.log('\n--- Test 1: Create Cancellation Request ---');
    const request = await CancellationRequestService.createRequest(
      booking._id.toString(),
      client._id.toString(),
      'schedule_change',
      'Test cancellation'
    );
    console.log('✓ Cancellation request created');
    console.log(`  Request ID: ${request._id}`);
    console.log(`  Status: ${request.status}`);
    console.log(`  Is Automatic: ${request.isAutomatic}`);
    console.log(`  Refund Amount: ₱${request.refundCalculation.finalRefund}`);
    console.log(`  Refund Percentage: ${request.refundCalculation.refundPercentage}%`);

    // Test 2: Try to create duplicate request (should fail)
    console.log('\n--- Test 2: Duplicate Request Validation ---');
    try {
      await CancellationRequestService.createRequest(
        booking._id.toString(),
        client._id.toString(),
        'emergency'
      );
      console.log('✗ Should have thrown error for duplicate request');
    } catch (error) {
      console.log('✓ Duplicate request prevented:', error.message);
    }

    // Test 3: Get owner requests
    console.log('\n--- Test 3: Get Owner Requests ---');
    const ownerRequests = await CancellationRequestService.getOwnerRequests(
      listing.owner.toString(),
      { status: 'pending' }
    );
    console.log(`✓ Found ${ownerRequests.total} pending requests for owner`);
    console.log(`  Page: ${ownerRequests.page} of ${ownerRequests.pages}`);

    // Test 4: Approve request
    console.log('\n--- Test 4: Approve Request ---');
    const approvedRequest = await CancellationRequestService.approveRequest(
      request._id.toString(),
      listing.owner.toString()
    );
    console.log('✓ Request approved');
    console.log(`  Status: ${approvedRequest.status}`);
    console.log(`  Approved at: ${approvedRequest.approvedAt}`);

    // Verify booking status updated
    const updatedBooking = await Booking.findById(booking._id);
    console.log(`  Booking status: ${updatedBooking.status}`);

    // Clean up
    console.log('\n--- Cleanup ---');
    await CancellationRequest.deleteOne({ _id: request._id });
    await Booking.deleteOne({ _id: booking._id });
    console.log('✓ Test data cleaned up');

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

// Run tests
testCancellationRequestService();
