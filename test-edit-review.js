/**
 * Test Edit Review Functionality
 * 
 * This script tests the edit review feature including:
 * - Edit eligibility checking
 * - Review update within 24 hours
 * - Edit after 24 hours (should fail)
 * - Edited badge display
 */

const mongoose = require('mongoose');
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const ReviewService = require('./src/services/ReviewService');

require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/flexidesk';

async function testEditReview() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await Review.deleteMany({ comment: /Test edit review/ });
    await Booking.deleteMany({ status: 'test_edit' });
    await Listing.deleteMany({ venue: 'Test Edit Listing' });
    await User.deleteMany({ email: /test-edit-review/ });

    // Create test user
    console.log('👤 Creating test user...');
    const testUser = await User.create({
      email: 'test-edit-review@example.com',
      fullName: 'Test Edit User',
      password: 'password123',
      role: 'client',
    });
    console.log(`✅ Created user: ${testUser._id}\n`);

    // Create test owner
    console.log('👤 Creating test owner...');
    const testOwner = await User.create({
      email: 'test-edit-owner@example.com',
      fullName: 'Test Edit Owner',
      password: 'password123',
      role: 'owner',
    });
    console.log(`✅ Created owner: ${testOwner._id}\n`);

    // Create test listing
    console.log('🏢 Creating test listing...');
    const testListing = await Listing.create({
      venue: 'Test Edit Listing',
      shortDesc: 'Test listing for edit review',
      ownerId: testOwner._id,
      category: 'office',
      priceSeatDay: 500,
      capacity: 10,
      address: 'Test Address',
      city: 'Test City',
      country: 'Test Country',
    });
    console.log(`✅ Created listing: ${testListing._id}\n`);

    // Create test booking (completed, in the past)
    console.log('📅 Creating test booking...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const testBooking = await Booking.create({
      userId: testUser._id,
      listingId: testListing._id,
      ownerId: testOwner._id,
      startDate: twoDaysAgo,
      endDate: yesterday,
      status: 'completed',
      amount: 500,
      guests: 1,
    });
    console.log(`✅ Created booking: ${testBooking._id}\n`);

    // Test 1: Create initial review
    console.log('📝 Test 1: Creating initial review...');
    const review = await ReviewService.createReview(
      testBooking._id,
      testUser._id,
      {
        rating: 4,
        comment: 'Test edit review - initial version',
        photos: [],
      }
    );
    console.log(`✅ Created review: ${review._id}`);
    console.log(`   Rating: ${review.rating}`);
    console.log(`   Comment: ${review.comment}`);
    console.log(`   isEdited: ${review.isEdited}\n`);

    // Test 2: Check edit eligibility (should be eligible)
    console.log('🔍 Test 2: Checking edit eligibility (should be eligible)...');
    const eligibility = await ReviewService.checkEditEligibility(
      review._id,
      testUser._id
    );
    console.log(`   Eligible: ${eligibility.eligible}`);
    console.log(`   Hours remaining: ${eligibility.hoursRemaining}`);
    if (!eligibility.eligible) {
      console.log(`   ❌ Reason: ${eligibility.reason}`);
      throw new Error('Review should be eligible for editing');
    }
    console.log('✅ Edit eligibility check passed\n');

    // Test 3: Update review within 24 hours
    console.log('✏️  Test 3: Updating review within 24 hours...');
    const updatedReview = await ReviewService.updateReview(
      review._id,
      testUser._id,
      {
        rating: 5,
        comment: 'Test edit review - updated version with better rating',
      }
    );
    console.log(`✅ Updated review: ${updatedReview._id}`);
    console.log(`   New rating: ${updatedReview.rating}`);
    console.log(`   New comment: ${updatedReview.comment}`);
    console.log(`   isEdited: ${updatedReview.isEdited}`);
    console.log(`   editedAt: ${updatedReview.editedAt}\n`);

    if (!updatedReview.isEdited) {
      throw new Error('Review should be marked as edited');
    }
    if (updatedReview.rating !== 5) {
      throw new Error('Review rating should be updated to 5');
    }

    // Test 4: Verify edited badge data
    console.log('🏷️  Test 4: Verifying edited badge data...');
    const reviewFromDb = await Review.findById(review._id);
    console.log(`   isEdited: ${reviewFromDb.isEdited}`);
    console.log(`   editedAt: ${reviewFromDb.editedAt}`);
    console.log(`   createdAt: ${reviewFromDb.createdAt}`);
    
    if (!reviewFromDb.isEdited || !reviewFromDb.editedAt) {
      throw new Error('Review should have isEdited=true and editedAt timestamp');
    }
    console.log('✅ Edited badge data verified\n');

    // Test 5: Test edit after 24 hours (simulate by modifying createdAt)
    console.log('⏰ Test 5: Testing edit after 24 hours (should fail)...');
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago
    await Review.findByIdAndUpdate(review._id, { createdAt: oldDate });

    try {
      await ReviewService.updateReview(
        review._id,
        testUser._id,
        {
          comment: 'This should fail',
        }
      );
      throw new Error('Update should have failed after 24 hours');
    } catch (err) {
      if (err.message.includes('24 hours')) {
        console.log(`✅ Edit correctly rejected: ${err.message}\n`);
      } else {
        throw err;
      }
    }

    // Test 6: Check edit eligibility after 24 hours
    console.log('🔍 Test 6: Checking edit eligibility after 24 hours...');
    const eligibilityAfter = await ReviewService.checkEditEligibility(
      review._id,
      testUser._id
    );
    console.log(`   Eligible: ${eligibilityAfter.eligible}`);
    console.log(`   Reason: ${eligibilityAfter.reason}`);
    console.log(`   Hours remaining: ${eligibilityAfter.hoursRemaining}`);
    
    if (eligibilityAfter.eligible) {
      throw new Error('Review should not be eligible for editing after 24 hours');
    }
    console.log('✅ Edit eligibility check after 24 hours passed\n');

    // Test 7: Verify listing rating was recalculated
    console.log('⭐ Test 7: Verifying listing rating recalculation...');
    const updatedListing = await Listing.findById(testListing._id);
    console.log(`   Listing rating: ${updatedListing.rating}`);
    console.log(`   Review count: ${updatedListing.reviewCount}`);
    
    if (updatedListing.rating !== 5) {
      throw new Error('Listing rating should be updated to 5');
    }
    if (updatedListing.reviewCount !== 1) {
      throw new Error('Listing should have 1 review');
    }
    console.log('✅ Listing rating recalculation verified\n');

    console.log('🎉 All tests passed!\n');

    // Clean up
    console.log('🧹 Cleaning up test data...');
    await Review.deleteOne({ _id: review._id });
    await Booking.deleteOne({ _id: testBooking._id });
    await Listing.deleteOne({ _id: testListing._id });
    await User.deleteOne({ _id: testUser._id });
    await User.deleteOne({ _id: testOwner._id });
    console.log('✅ Cleanup complete\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run tests
testEditReview();
