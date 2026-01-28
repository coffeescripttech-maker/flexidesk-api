/**
 * Test: Owner Review Dashboard API
 * 
 * This test verifies that the owner review dashboard API endpoints work correctly.
 * 
 * Prerequisites:
 * - MongoDB running
 * - Server running on port 5000
 * - At least one owner user with listings and reviews
 * 
 * Run: node test-owner-review-dashboard.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test credentials - replace with actual owner credentials
const OWNER_EMAIL = 'owner@test.com';
const OWNER_PASSWORD = 'password123';

let ownerToken = null;

async function login() {
  console.log('\n1. Logging in as owner...');
  try {
    const res = await axios.post(`${API_BASE}/account/login`, {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    });
    
    ownerToken = res.data.token;
    console.log('✓ Login successful');
    console.log('  Token:', ownerToken.substring(0, 20) + '...');
    return true;
  } catch (err) {
    console.error('✗ Login failed:', err.response?.data?.message || err.message);
    return false;
  }
}

async function getOwnerReviews() {
  console.log('\n2. Fetching owner reviews...');
  try {
    const res = await axios.get(`${API_BASE}/owner/reviews/my-reviews`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      params: {
        status: 'visible',
        sort: 'recent',
        limit: 10,
      }
    });
    
    console.log('✓ Reviews fetched successfully');
    console.log('  Total reviews:', res.data.total);
    console.log('  Reviews in response:', res.data.reviews.length);
    
    if (res.data.stats) {
      console.log('  Statistics:');
      console.log('    - Total reviews:', res.data.stats.totalReviews);
      console.log('    - Average rating:', res.data.stats.averageRating);
      console.log('    - Reply rate:', res.data.stats.replyRate + '%');
      console.log('    - Reviews with reply:', res.data.stats.reviewsWithReply);
      console.log('    - Reviews without reply:', res.data.stats.reviewsWithoutReply);
    }
    
    if (res.data.reviews.length > 0) {
      const review = res.data.reviews[0];
      console.log('\n  Sample review:');
      console.log('    - ID:', review._id);
      console.log('    - Rating:', review.rating);
      console.log('    - Comment:', review.comment?.substring(0, 50) + '...');
      console.log('    - Has reply:', !!(review.ownerReply && review.ownerReply.text));
      
      if (review.listingId) {
        console.log('    - Listing:', review.listingId.venue || review.listingId.shortDesc);
      }
      
      if (review.userId) {
        console.log('    - User:', review.userId.name || review.userId.fullName);
      }
    }
    
    return res.data.reviews;
  } catch (err) {
    console.error('✗ Failed to fetch reviews:', err.response?.data?.message || err.message);
    return [];
  }
}

async function filterReviewsByReplyStatus() {
  console.log('\n3. Testing reply status filters...');
  
  // Test unreplied reviews
  try {
    const res = await axios.get(`${API_BASE}/owner/reviews/my-reviews`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      params: {
        hasReply: 'false',
        limit: 5,
      }
    });
    
    console.log('✓ Unreplied reviews:', res.data.total);
  } catch (err) {
    console.error('✗ Failed to fetch unreplied reviews:', err.response?.data?.message || err.message);
  }
  
  // Test replied reviews
  try {
    const res = await axios.get(`${API_BASE}/owner/reviews/my-reviews`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      params: {
        hasReply: 'true',
        limit: 5,
      }
    });
    
    console.log('✓ Replied reviews:', res.data.total);
  } catch (err) {
    console.error('✗ Failed to fetch replied reviews:', err.response?.data?.message || err.message);
  }
}

async function testSorting() {
  console.log('\n4. Testing sorting options...');
  
  const sortOptions = ['recent', 'oldest', 'highest', 'lowest'];
  
  for (const sort of sortOptions) {
    try {
      const res = await axios.get(`${API_BASE}/owner/reviews/my-reviews`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
        params: {
          sort,
          limit: 3,
        }
      });
      
      console.log(`✓ Sort by ${sort}: ${res.data.reviews.length} reviews`);
      
      if (res.data.reviews.length > 0) {
        const ratings = res.data.reviews.map(r => r.rating);
        console.log(`  Ratings: ${ratings.join(', ')}`);
      }
    } catch (err) {
      console.error(`✗ Failed to sort by ${sort}:`, err.response?.data?.message || err.message);
    }
  }
}

async function testReplyCreation(reviewId) {
  console.log('\n5. Testing reply creation...');
  
  if (!reviewId) {
    console.log('⊘ Skipping - no review ID provided');
    return;
  }
  
  try {
    const res = await axios.post(
      `${API_BASE}/reviews/${reviewId}/reply`,
      {
        text: 'Thank you for your feedback! We appreciate your review and are glad you enjoyed your stay.',
      },
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );
    
    console.log('✓ Reply created successfully');
    console.log('  Reply text:', res.data.review.ownerReply.text);
    console.log('  Created at:', res.data.review.ownerReply.createdAt);
  } catch (err) {
    console.error('✗ Failed to create reply:', err.response?.data?.message || err.message);
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Owner Review Dashboard API Test');
  console.log('='.repeat(60));
  
  // Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n✗ Tests aborted - login failed');
    return;
  }
  
  // Get reviews
  const reviews = await getOwnerReviews();
  
  // Filter by reply status
  await filterReviewsByReplyStatus();
  
  // Test sorting
  await testSorting();
  
  // Test reply creation (only if there's an unreplied review)
  const unrepliedReview = reviews.find(r => !r.ownerReply || !r.ownerReply.text);
  if (unrepliedReview) {
    await testReplyCreation(unrepliedReview._id);
  } else {
    console.log('\n5. Testing reply creation...');
    console.log('⊘ Skipping - no unreplied reviews found');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests completed!');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(err => {
  console.error('\n✗ Test suite failed:', err.message);
  process.exit(1);
});
