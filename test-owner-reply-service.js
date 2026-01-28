/**
 * Test Owner Reply Service
 * 
 * This script tests the owner reply functionality:
 * 1. Create a review
 * 2. Owner creates a reply
 * 3. Owner updates the reply (within 24 hours)
 * 4. Test authorization (non-owner cannot reply)
 * 5. Test validation (character limits, etc.)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const OwnerReplyService = require('./src/services/OwnerReplyService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

async function runTests() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create test data
    console.log('📝 Test 1: Creating test data...');
    
    // Find existing users
    const client = await User.findOne({ role: 'client' });
    if (!client) {
      console.log('❌ No client user found. Please create a client user first.');
      return;
    }

    const owner = await User.findOne({ role: 'owner' });
    if (!owner) {
      console.log('❌ No owner user found. Please create an owner user first.');
      return;
    }

    const otherOwner = await User.findOne({ 
      role: 'owner',
      _id: { $ne: owner._id }
    });
    if (!otherOwner) {
      console.log('⚠️ Warning: Only one owner found. Will skip non-owner authorization test.');
    }

    // Create test listing
    let listing = await Listing.findOne({ venue: 'Test Workspace for Reply' });
    if (!listing) {
      listing = await Listing.create({
        venue: 'Test Workspace for Reply',
        shortDesc: 'A test workspace',
        address: '123 Test St',
        city: 'Test City',
        ownerId: owner._id,
        owner: owner._id,
        userId: owner._id,
        dailyPrice: 100,
        capacity: 10,
        status: 'active',
      });
    }

    // Create test booking
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    
    let booking = await Booking.findOne({ 
      userId: client._id,
      listingId: listing._id,
      status: 'completed'
    });
    
    if (!booking) {
      booking = await Booking.create({
        userId: client._id,
        listingId: listing._id,
        ownerId: owner._id,
        startDate: pastDate,
        endDate: new Date(pastDate.getTime() + 8 * 60 * 60 * 1000),
        status: 'completed',
        totalPrice: 100,
        amount: 100,
      });
    }

    // Create test review
    let review = await Review.findOne({ bookingId: booking._id });
    if (review) {
      // Clear any existing reply for testing
      review.ownerReply = undefined;
      await review.save();
    } else {
      review = await Review.create({
        bookingId: booking._id,
        listingId: listing._id,
        userId: client._id,
        ownerId: owner._id,
        rating: 4,
        comment: 'Great workspace! Very clean and professional. WiFi was a bit slow though.',
        status: 'visible',
      });
    }

    console.log('✅ Test data created');
    console.log(`   Client: ${client.email}`);
    console.log(`   Owner: ${owner.email}`);
    console.log(`   Listing: ${listing.venue}`);
    console.log(`   Review ID: ${review._id}\n`);

    // Test 2: Check authorization (can owner reply?)
    console.log('🔐 Test 2: Checking authorization...');
    const canReplyResult = await OwnerReplyService.canReply(review._id, owner._id);
    console.log(`   Can owner reply: ${canReplyResult.canReply}`);
    if (!canReplyResult.canReply) {
      console.log(`   ❌ FAILED: ${canReplyResult.reason}`);
      return;
    }
    console.log('✅ Authorization check passed\n');

    // Test 3: Check authorization (can other owner reply?)
    if (otherOwner) {
      console.log('🔐 Test 3: Checking authorization for non-owner...');
      const cannotReplyResult = await OwnerReplyService.canReply(review._id, otherOwner._id);
      console.log(`   Can other owner reply: ${cannotReplyResult.canReply}`);
      if (cannotReplyResult.canReply) {
        console.log('   ❌ FAILED: Other owner should not be able to reply');
        return;
      }
      console.log(`   ✅ Correctly rejected: ${cannotReplyResult.reason}\n`);
    } else {
      console.log('⏭️ Test 3: Skipped (no other owner available)\n');
    }

    // Test 4: Create owner reply
    console.log('💬 Test 4: Creating owner reply...');
    try {
      const replyText = 'Thank you for your feedback! We have upgraded our WiFi to provide faster speeds. We hope to see you again soon!';
      const updatedReview = await OwnerReplyService.createReply(review._id, owner._id, replyText);
      
      console.log('✅ Reply created successfully');
      console.log(`   Reply text: "${updatedReview.ownerReply.text}"`);
      console.log(`   Created at: ${updatedReview.ownerReply.createdAt}`);
      console.log(`   Is edited: ${updatedReview.ownerReply.isEdited}\n`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      return;
    }

    // Test 5: Try to create duplicate reply (should fail)
    console.log('🚫 Test 5: Trying to create duplicate reply...');
    try {
      await OwnerReplyService.createReply(review._id, owner._id, 'Another reply');
      console.log('   ❌ FAILED: Should not allow duplicate reply\n');
      return;
    } catch (error) {
      console.log(`   ✅ Correctly rejected: ${error.message}\n`);
    }

    // Test 6: Update owner reply
    console.log('✏️ Test 6: Updating owner reply...');
    try {
      const newReplyText = 'Thank you for your feedback! We have upgraded our WiFi to 1Gbps fiber. Looking forward to your next visit!';
      const updatedReview = await OwnerReplyService.updateReply(review._id, owner._id, newReplyText);
      
      console.log('✅ Reply updated successfully');
      console.log(`   New reply text: "${updatedReview.ownerReply.text}"`);
      console.log(`   Updated at: ${updatedReview.ownerReply.updatedAt}`);
      console.log(`   Is edited: ${updatedReview.ownerReply.isEdited}\n`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      return;
    }

    // Test 7: Test validation - reply too short
    console.log('📏 Test 7: Testing validation (reply too short)...');
    try {
      await OwnerReplyService.updateReply(review._id, owner._id, 'Hi');
      console.log('   ❌ FAILED: Should reject short reply\n');
      return;
    } catch (error) {
      console.log(`   ✅ Correctly rejected: ${error.message}\n`);
    }

    // Test 8: Test validation - reply too long
    console.log('📏 Test 8: Testing validation (reply too long)...');
    try {
      const longReply = 'A'.repeat(301);
      await OwnerReplyService.updateReply(review._id, owner._id, longReply);
      console.log('   ❌ FAILED: Should reject long reply\n');
      return;
    } catch (error) {
      console.log(`   ✅ Correctly rejected: ${error.message}\n`);
    }

    // Test 9: Get owner reviews
    console.log('📋 Test 9: Getting owner reviews...');
    try {
      const result = await OwnerReplyService.getOwnerReviews(owner._id, {
        status: 'visible',
        page: 1,
        limit: 10,
      });
      
      console.log('✅ Owner reviews retrieved');
      console.log(`   Total reviews: ${result.total}`);
      console.log(`   Reviews with reply: ${result.stats.reviewsWithReply}`);
      console.log(`   Reviews without reply: ${result.stats.reviewsWithoutReply}`);
      console.log(`   Reply rate: ${result.stats.replyRate}%`);
      console.log(`   Average rating: ${result.stats.averageRating}\n`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      return;
    }

    // Test 10: Filter reviews without reply
    console.log('🔍 Test 10: Filtering reviews without reply...');
    try {
      const result = await OwnerReplyService.getOwnerReviews(owner._id, {
        hasReply: false,
        status: 'visible',
      });
      
      console.log('✅ Filtered reviews retrieved');
      console.log(`   Reviews without reply: ${result.total}\n`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      return;
    }

    // Test 11: Test 24-hour edit window (simulate old reply)
    console.log('⏰ Test 11: Testing 24-hour edit window...');
    try {
      // Create a new review with an old reply
      const oldReview = await Review.create({
        bookingId: new mongoose.Types.ObjectId(),
        listingId: listing._id,
        userId: client._id,
        ownerId: owner._id,
        rating: 5,
        comment: 'Excellent workspace!',
        status: 'visible',
        ownerReply: {
          text: 'Thank you!',
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          isEdited: false,
        },
      });

      await OwnerReplyService.updateReply(oldReview._id, owner._id, 'Updated reply');
      console.log('   ❌ FAILED: Should not allow editing after 24 hours\n');
      
      // Clean up
      await Review.findByIdAndDelete(oldReview._id);
      return;
    } catch (error) {
      console.log(`   ✅ Correctly rejected: ${error.message}\n`);
    }

    console.log('🎉 All tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run tests
runTests();
