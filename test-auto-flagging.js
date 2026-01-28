/**
 * Test Auto-Flagging Logic
 * Tests the auto-flagging functionality with database integration
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ContentModerationService = require('./src/services/ContentModerationService');
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');

async function runTests() {
  let testClient, testOwner, testListing, testBooking;
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to database\n');

    console.log('=== Testing Auto-Flagging Logic ===\n');

    // Clean up test data
    await Review.deleteMany({ comment: /TEST_AUTO_FLAG/ });
    await User.deleteMany({ email: /test-auto-flag/ });
    const testUsers = await User.find({ email: /test-auto-flag/ });
    if (testUsers.length > 0) {
      const testUserIds = testUsers.map(u => u._id);
      await Booking.deleteMany({ userId: { $in: testUserIds } });
      await Listing.deleteMany({ owner: { $in: testUserIds } });
    }

    // Create test users
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    testClient = await User.create({
      email: 'test-auto-flag-client@test.com',
      passwordHash: hashedPassword,
      fullName: 'Test Client',
      role: 'client'
    });

    testOwner = await User.create({
      email: 'test-auto-flag-owner@test.com',
      passwordHash: hashedPassword,
      fullName: 'Test Owner',
      role: 'owner'
    });

    // Create test listing
    testListing = await Listing.create({
      title: 'TEST_AUTO_FLAG Workspace',
      owner: testOwner._id,
      description: 'Test workspace',
      address: '123 Test St',
      city: 'Test City',
      dailyPrice: 100,
      capacity: 10,
      amenities: ['WiFi'],
      category: 'office'
    });

    // Create test booking
    testBooking = await Booking.create({
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'completed',
      amount: 500,
      nights: 5,
      guests: 1
    });

    console.log('✓ Test data created\n');

    // Test 1: Review with profanity should be auto-flagged
    console.log('Test 1: Auto-flag review with profanity');
    const profaneReview = await Review.create({
      bookingId: testBooking._id,
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 2,
      comment: 'TEST_AUTO_FLAG This place is damn terrible and sucks badly.',
      status: 'visible'
    });

    const result1 = await ContentModerationService.autoFlag(profaneReview);
    console.log('Result:', JSON.stringify(result1, null, 2));
    console.log('Expected: Should flag with profanity reason');
    
    // Verify review was flagged in database
    const flaggedReview1 = await Review.findById(profaneReview._id);
    console.log('Review status:', flaggedReview1.status);
    console.log('Flag reason:', flaggedReview1.flagReason);
    console.log('✓ Pass:', result1.shouldFlag && flaggedReview1.status === 'flagged');
    console.log('');

    // Test 2: Review with external links should be auto-flagged
    console.log('Test 2: Auto-flag review with external links');
    const linkReview = await Review.create({
      bookingId: mongoose.Types.ObjectId(),
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 5,
      comment: 'TEST_AUTO_FLAG Great space! Visit https://example.com for more info.',
      status: 'visible'
    });

    const result2 = await ContentModerationService.autoFlag(linkReview);
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('Expected: Should flag with external_links reason');
    
    const flaggedReview2 = await Review.findById(linkReview._id);
    console.log('Review status:', flaggedReview2.status);
    console.log('Flag reason:', flaggedReview2.flagReason);
    console.log('✓ Pass:', result2.shouldFlag && flaggedReview2.status === 'flagged');
    console.log('');

    // Test 3: Review with contact info should be auto-flagged
    console.log('Test 3: Auto-flag review with contact information');
    const contactReview = await Review.create({
      bookingId: mongoose.Types.ObjectId(),
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 4,
      comment: 'TEST_AUTO_FLAG Nice workspace. Email me at test@example.com for details.',
      status: 'visible'
    });

    const result3 = await ContentModerationService.autoFlag(contactReview);
    console.log('Result:', JSON.stringify(result3, null, 2));
    console.log('Expected: Should flag with contact_info reason');
    
    const flaggedReview3 = await Review.findById(contactReview._id);
    console.log('Review status:', flaggedReview3.status);
    console.log('Flag reason:', flaggedReview3.flagReason);
    console.log('✓ Pass:', result3.shouldFlag && flaggedReview3.status === 'flagged');
    console.log('');

    // Test 4: Clean review should NOT be auto-flagged
    console.log('Test 4: Clean review should NOT be auto-flagged');
    const cleanReview = await Review.create({
      bookingId: mongoose.Types.ObjectId(),
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 5,
      comment: 'TEST_AUTO_FLAG Excellent workspace with great amenities and professional environment.',
      status: 'visible'
    });

    const result4 = await ContentModerationService.autoFlag(cleanReview);
    console.log('Result:', JSON.stringify(result4, null, 2));
    console.log('Expected: Should NOT flag');
    
    const cleanReviewCheck = await Review.findById(cleanReview._id);
    console.log('Review status:', cleanReviewCheck.status);
    console.log('✓ Pass:', !result4.shouldFlag && cleanReviewCheck.status === 'visible');
    console.log('');

    // Test 5: Review with multiple violations
    console.log('Test 5: Review with multiple violations');
    const multiViolationReview = await Review.create({
      bookingId: mongoose.Types.ObjectId(),
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 1,
      comment: 'TEST_AUTO_FLAG This place sucks! Email me at bad@test.com or visit www.complaint.com',
      status: 'visible'
    });

    const result5 = await ContentModerationService.autoFlag(multiViolationReview);
    console.log('Result:', JSON.stringify(result5, null, 2));
    console.log('Expected: Should flag with multiple reasons');
    console.log('Violations found:', result5.violations ? result5.violations.length : 0);
    
    const flaggedReview5 = await Review.findById(multiViolationReview._id);
    console.log('Review status:', flaggedReview5.status);
    console.log('Flag reason:', flaggedReview5.flagReason);
    console.log('✓ Pass:', result5.shouldFlag && result5.violations.length > 1 && flaggedReview5.status === 'flagged');
    console.log('');

    // Test 6: Test getFlaggedReviews
    console.log('Test 6: Get flagged reviews');
    const flaggedReviews = await ContentModerationService.getFlaggedReviews({
      status: 'flagged',
      page: 1,
      limit: 10
    });
    console.log('Total flagged reviews:', flaggedReviews.total);
    console.log('Reviews returned:', flaggedReviews.reviews.length);
    console.log('✓ Pass:', flaggedReviews.total >= 4); // We created 4 flagged reviews
    console.log('');

    // Test 7: Test moderateReview - approve action
    console.log('Test 7: Moderate review - approve action');
    const adminUser = await User.findOne({ role: 'admin' }) || testOwner;
    const approvedReview = await ContentModerationService.moderateReview(
      profaneReview._id,
      'approve',
      adminUser._id,
      'Reviewed and approved'
    );
    console.log('Review status after approval:', approvedReview.status);
    console.log('Moderated by:', approvedReview.moderatedBy);
    console.log('✓ Pass:', approvedReview.status === 'visible');
    console.log('');

    // Test 8: Test moderateReview - hide action
    console.log('Test 8: Moderate review - hide action');
    const hiddenReview = await ContentModerationService.moderateReview(
      linkReview._id,
      'hide',
      adminUser._id,
      'Contains inappropriate links'
    );
    console.log('Review status after hiding:', hiddenReview.status);
    console.log('✓ Pass:', hiddenReview.status === 'hidden');
    console.log('');

    // Clean up test data
    console.log('Cleaning up test data...');
    await Review.deleteMany({ comment: /TEST_AUTO_FLAG/ });
    await Booking.deleteMany({ listingId: testListing._id });
    await Listing.deleteMany({ title: /TEST_AUTO_FLAG/ });
    await User.deleteMany({ email: /test-auto-flag/ });
    console.log('✓ Test data cleaned up\n');

    console.log('=== All Auto-Flagging Tests Complete ===');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

runTests();
