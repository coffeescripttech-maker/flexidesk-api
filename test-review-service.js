/**
 * Test ReviewService Core Functions
 * Tests the ReviewService class methods
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ReviewService = require('./src/services/ReviewService');
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');

async function testReviewService() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await Review.deleteMany({ comment: /TEST_REVIEW_SERVICE/ });
    await Booking.deleteMany({ status: 'TEST_BOOKING' });
    
    // Find an existing test user (client)
    let testUser = await User.findOne({ role: 'client' });
    if (!testUser) {
      console.log('❌ No client users found. Please create a user first.');
      return;
    }
    console.log(`👤 Using test user: ${testUser.email}`);

    // Find an active listing
    const testListing = await Listing.findOne({ status: 'active' });
    if (!testListing) {
      console.log('❌ No active listings found. Please create a listing first.');
      return;
    }

    console.log(`📍 Using listing: ${testListing._id}\n`);

    // Test 1: Check eligibility for non-existent booking
    console.log('Test 1: Check eligibility for non-existent booking');
    const fakeBookingId = new mongoose.Types.ObjectId();
    const eligibility1 = await ReviewService.checkEligibility(fakeBookingId, testUser._id);
    console.log('Result:', eligibility1);
    console.log(eligibility1.eligible === false ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 2: Create a completed booking
    console.log('Test 2: Create a completed booking');
    const completedBooking = await Booking.create({
      userId: testUser._id,
      ownerId: testListing.owner,
      listingId: testListing._id,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'completed',
      amount: 1000,
      nights: 5
    });
    console.log('Created booking:', completedBooking._id);
    console.log('✅ PASS\n');

    // Test 3: Check eligibility for completed booking
    console.log('Test 3: Check eligibility for completed booking');
    const eligibility2 = await ReviewService.checkEligibility(completedBooking._id, testUser._id);
    console.log('Result:', eligibility2);
    console.log(eligibility2.eligible === true ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 4: Create a review
    console.log('Test 4: Create a review');
    const reviewData = {
      rating: 5,
      comment: 'TEST_REVIEW_SERVICE - Excellent workspace! Very clean and professional.',
      photos: []
    };
    const review = await ReviewService.createReview(
      completedBooking._id,
      testUser._id,
      reviewData
    );
    console.log('Created review:', review._id);
    console.log('Rating:', review.rating);
    console.log('Comment:', review.comment);
    console.log('✅ PASS\n');

    // Test 5: Check eligibility after review created (should fail)
    console.log('Test 5: Check eligibility after review created');
    const eligibility3 = await ReviewService.checkEligibility(completedBooking._id, testUser._id);
    console.log('Result:', eligibility3);
    console.log(eligibility3.eligible === false && eligibility3.reason.includes('already reviewed') ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 6: Update review within 24 hours
    console.log('Test 6: Update review within 24 hours');
    const updatedReview = await ReviewService.updateReview(
      review._id,
      testUser._id,
      {
        rating: 4,
        comment: 'TEST_REVIEW_SERVICE - Updated: Good workspace, minor WiFi issues.'
      }
    );
    console.log('Updated review:', updatedReview._id);
    console.log('New rating:', updatedReview.rating);
    console.log('Is edited:', updatedReview.isEdited);
    console.log(updatedReview.rating === 4 && updatedReview.isEdited === true ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 7: Calculate listing rating
    console.log('Test 7: Calculate listing rating');
    const ratingStats = await ReviewService.calculateListingRating(testListing._id);
    console.log('Rating stats:', ratingStats);
    console.log(ratingStats.reviewCount >= 1 ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 8: Get listing reviews
    console.log('Test 8: Get listing reviews');
    const listingReviews = await ReviewService.getListingReviews(testListing._id, {
      sort: 'recent',
      page: 1,
      limit: 10
    });
    console.log('Total reviews:', listingReviews.total);
    console.log('Average rating:', listingReviews.averageRating);
    console.log('Distribution:', listingReviews.distribution);
    console.log(listingReviews.reviews.length > 0 ? '✅ PASS' : '❌ FAIL');
    console.log('');

    // Test 9: Validate rating bounds
    console.log('Test 9: Validate rating bounds (should fail)');
    const invalidBooking = await Booking.create({
      userId: testUser._id,
      ownerId: testListing.owner,
      listingId: testListing._id,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'completed',
      amount: 1000,
      nights: 5
    });
    
    try {
      await ReviewService.createReview(
        invalidBooking._id,
        testUser._id,
        { rating: 6, comment: 'TEST_REVIEW_SERVICE - Invalid rating test' }
      );
      console.log('❌ FAIL - Should have thrown error for invalid rating');
    } catch (error) {
      console.log('Error caught:', error.message);
      console.log(error.message.includes('between 1 and 5') ? '✅ PASS' : '❌ FAIL');
    }
    console.log('');

    // Test 10: Validate comment length
    console.log('Test 10: Validate comment length (should fail)');
    const shortCommentBooking = await Booking.create({
      userId: testUser._id,
      ownerId: testListing.owner,
      listingId: testListing._id,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'completed',
      amount: 1000,
      nights: 5
    });
    
    try {
      await ReviewService.createReview(
        shortCommentBooking._id,
        testUser._id,
        { rating: 5, comment: 'Short' }
      );
      console.log('❌ FAIL - Should have thrown error for short comment');
    } catch (error) {
      console.log('Error caught:', error.message);
      console.log(error.message.includes('at least 10 characters') ? '✅ PASS' : '❌ FAIL');
    }
    console.log('');

    // Test 11: Check cancelled booking eligibility
    console.log('Test 11: Check cancelled booking eligibility');
    const cancelledBooking = await Booking.create({
      userId: testUser._id,
      ownerId: testListing.owner,
      listingId: testListing._id,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'cancelled',
      amount: 1000,
      nights: 5
    });
    
    const eligibility4 = await ReviewService.checkEligibility(cancelledBooking._id, testUser._id);
    console.log('Result:', eligibility4);
    console.log(eligibility4.eligible === false && eligibility4.reason.includes('cancelled') ? '✅ PASS' : '❌ FAIL');
    console.log('');

    console.log('✅ All tests completed!\n');

    // Clean up
    console.log('🧹 Cleaning up test data...');
    await Review.deleteMany({ comment: /TEST_REVIEW_SERVICE/ });
    await Booking.deleteMany({ userId: testUser._id, amount: 1000 });
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

testReviewService();
