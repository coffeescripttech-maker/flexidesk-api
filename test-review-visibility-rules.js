/**
 * Test Review Visibility Rules Implementation
 * 
 * Tests:
 * 1. Public users can only see visible reviews
 * 2. Admins can see all reviews (visible, hidden, flagged, deleted)
 * 3. Hidden/flagged reviews are excluded from rating calculations
 * 4. Minimum 3 reviews required to display public rating
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Review = require('./src/models/Review');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const Booking = require('./src/models/Booking');
const ReviewService = require('./src/services/ReviewService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/flexidesk';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function cleanup() {
  console.log('\n--- Cleaning up test data ---');
  
  // Clean up test reviews
  await Review.deleteMany({ 
    comment: { $regex: /TEST VISIBILITY/i } 
  });
  
  console.log('✓ Cleanup complete');
}

async function testVisibilityRules() {
  console.log('\n=== Testing Review Visibility Rules ===\n');

  // Find or create test users
  let testClient = await User.findOne({ email: 'testclient@example.com' });
  if (!testClient) {
    testClient = await User.create({
      email: 'testclient@example.com',
      name: 'Test Client',
      role: 'client',
      password: 'password123'
    });
  }

  let testOwner = await User.findOne({ email: 'testowner@example.com' });
  if (!testOwner) {
    testOwner = await User.create({
      email: 'testowner@example.com',
      name: 'Test Owner',
      role: 'owner',
      password: 'password123'
    });
  }

  let testAdmin = await User.findOne({ email: 'testadmin@example.com' });
  if (!testAdmin) {
    testAdmin = await User.create({
      email: 'testadmin@example.com',
      name: 'Test Admin',
      role: 'admin',
      isAdmin: true,
      password: 'password123'
    });
  }

  // Find or create test listing
  let testListing = await Listing.findOne({ venue: 'TEST VISIBILITY Workspace' });
  if (!testListing) {
    testListing = await Listing.create({
      venue: 'TEST VISIBILITY Workspace',
      title: 'Test Workspace for Visibility',
      owner: testOwner._id,
      status: 'active',
      category: 'office',
      seats: 10,
      priceSeatDay: 500,
      city: 'Manila',
      country: 'Philippines'
    });
  }

  console.log('✓ Test users and listing created');

  // Create test bookings and reviews with different statuses
  const reviewStatuses = ['visible', 'hidden', 'flagged', 'deleted'];
  const createdReviews = [];

  for (let i = 0; i < 5; i++) {
    const booking = await Booking.create({
      userId: testClient._id,
      listingId: testListing._id,
      ownerId: testOwner._id,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      status: 'completed',
      seats: 1,
      totalPrice: 500
    });

    const status = i < reviewStatuses.length ? reviewStatuses[i] : 'visible';
    
    const review = await Review.create({
      bookingId: booking._id,
      listingId: testListing._id,
      userId: testClient._id,
      ownerId: testOwner._id,
      rating: 4 + (i % 2),
      comment: `TEST VISIBILITY review ${i + 1} - Status: ${status}`,
      status: status,
      flagReason: status === 'flagged' ? 'spam' : undefined,
      flaggedBy: status === 'flagged' ? testAdmin._id : undefined,
      flaggedAt: status === 'flagged' ? new Date() : undefined
    });

    createdReviews.push(review);
  }

  console.log(`✓ Created ${createdReviews.length} test reviews with different statuses`);

  // Test 1: Public users can only see visible reviews
  console.log('\n--- Test 1: Public User Visibility ---');
  const publicReviews = await ReviewService.getListingReviews(testListing._id, {
    isAdmin: false,
    status: 'visible'
  });

  const visibleCount = createdReviews.filter(r => r.status === 'visible').length;
  console.log(`Expected visible reviews: ${visibleCount}`);
  console.log(`Actual visible reviews: ${publicReviews.reviews.length}`);
  
  if (publicReviews.reviews.length === visibleCount) {
    console.log('✓ Public users can only see visible reviews');
  } else {
    console.log('✗ FAILED: Public users seeing non-visible reviews');
  }

  // Verify no hidden/flagged/deleted reviews in public results
  const hasNonVisible = publicReviews.reviews.some(r => r.status !== 'visible');
  if (!hasNonVisible) {
    console.log('✓ No hidden/flagged/deleted reviews in public results');
  } else {
    console.log('✗ FAILED: Non-visible reviews found in public results');
  }

  // Test 2: Admins can see all reviews
  console.log('\n--- Test 2: Admin Visibility ---');
  
  // Test admin seeing flagged reviews
  const adminFlaggedReviews = await ReviewService.getListingReviews(testListing._id, {
    isAdmin: true,
    status: 'flagged'
  });

  const flaggedCount = createdReviews.filter(r => r.status === 'flagged').length;
  console.log(`Expected flagged reviews: ${flaggedCount}`);
  console.log(`Actual flagged reviews: ${adminFlaggedReviews.reviews.length}`);
  
  if (adminFlaggedReviews.reviews.length === flaggedCount) {
    console.log('✓ Admins can see flagged reviews');
  } else {
    console.log('✗ FAILED: Admin not seeing all flagged reviews');
  }

  // Test admin seeing hidden reviews
  const adminHiddenReviews = await ReviewService.getListingReviews(testListing._id, {
    isAdmin: true,
    status: 'hidden'
  });

  const hiddenCount = createdReviews.filter(r => r.status === 'hidden').length;
  console.log(`Expected hidden reviews: ${hiddenCount}`);
  console.log(`Actual hidden reviews: ${adminHiddenReviews.reviews.length}`);
  
  if (adminHiddenReviews.reviews.length === hiddenCount) {
    console.log('✓ Admins can see hidden reviews');
  } else {
    console.log('✗ FAILED: Admin not seeing all hidden reviews');
  }

  // Test 3: Rating calculation excludes non-visible reviews
  console.log('\n--- Test 3: Rating Calculation ---');
  
  const ratingStats = await ReviewService.calculateListingRating(testListing._id);
  
  console.log(`Total reviews created: ${createdReviews.length}`);
  console.log(`Visible reviews: ${visibleCount}`);
  console.log(`Rating calculation review count: ${ratingStats.reviewCount}`);
  
  if (ratingStats.reviewCount === visibleCount) {
    console.log('✓ Rating calculation only includes visible reviews');
  } else {
    console.log('✗ FAILED: Rating calculation including non-visible reviews');
  }

  // Verify rating is calculated correctly
  const visibleReviews = createdReviews.filter(r => r.status === 'visible');
  const expectedRating = visibleReviews.length > 0
    ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / visibleReviews.length
    : 0;
  const expectedRatingRounded = Math.round(expectedRating * 10) / 10;

  console.log(`Expected rating: ${expectedRatingRounded}`);
  console.log(`Actual rating: ${ratingStats.rating}`);
  
  if (Math.abs(ratingStats.rating - expectedRatingRounded) < 0.01) {
    console.log('✓ Rating calculated correctly from visible reviews only');
  } else {
    console.log('✗ FAILED: Rating calculation incorrect');
  }

  // Test 4: Minimum reviews threshold
  console.log('\n--- Test 4: Minimum Reviews Threshold ---');
  
  const reviewsResult = await ReviewService.getListingReviews(testListing._id, {
    isAdmin: false
  });

  console.log(`Review count: ${reviewsResult.reviewCount}`);
  console.log(`Has minimum reviews: ${reviewsResult.hasMinimumReviews}`);
  console.log(`Minimum required: ${reviewsResult.minimumRequired}`);
  console.log(`Displayed rating: ${reviewsResult.averageRating}`);
  
  if (reviewsResult.reviewCount < 3) {
    if (reviewsResult.averageRating === 0 && !reviewsResult.hasMinimumReviews) {
      console.log('✓ Rating hidden when below minimum threshold');
      console.log(`✓ Message: ${reviewsResult.message}`);
    } else {
      console.log('✗ FAILED: Rating shown despite being below threshold');
    }
  } else {
    if (reviewsResult.averageRating > 0 && reviewsResult.hasMinimumReviews) {
      console.log('✓ Rating shown when above minimum threshold');
    } else {
      console.log('✗ FAILED: Rating hidden despite being above threshold');
    }
  }

  // Test 5: Verify listing model updated correctly
  console.log('\n--- Test 5: Listing Model Update ---');
  
  const updatedListing = await Listing.findById(testListing._id);
  console.log(`Listing rating: ${updatedListing.rating}`);
  console.log(`Listing review count: ${updatedListing.reviewCount}`);
  console.log(`Rating distribution:`, updatedListing.ratingDistribution);
  
  if (updatedListing.reviewCount === visibleCount) {
    console.log('✓ Listing review count matches visible reviews');
  } else {
    console.log('✗ FAILED: Listing review count incorrect');
  }

  // Verify distribution only includes visible reviews
  const distributionTotal = Object.values(updatedListing.ratingDistribution || {}).reduce((sum, count) => sum + count, 0);
  if (distributionTotal === visibleCount) {
    console.log('✓ Rating distribution only includes visible reviews');
  } else {
    console.log('✗ FAILED: Rating distribution includes non-visible reviews');
  }
}

async function runTests() {
  try {
    await connectDB();
    await cleanup();
    await testVisibilityRules();
    
    console.log('\n=== All Tests Complete ===\n');
    
    await cleanup();
    await mongoose.connection.close();
    console.log('✓ Database connection closed');
    
  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

runTests();
