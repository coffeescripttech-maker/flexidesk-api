/**
 * Test Owner Reply API Endpoints
 * 
 * This script tests the owner reply API endpoints:
 * 1. POST /api/reviews/:id/reply - Create reply
 * 2. PUT /api/reviews/:id/reply - Update reply
 * 3. GET /api/reviews/owner/my-reviews - Get owner reviews
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

// Test credentials - replace with actual test accounts
const OWNER_EMAIL = 'zamielkairojavier@gmail.com';
const OWNER_PASSWORD = 'password123'; // Replace with actual password

let ownerToken = null;
let testReviewId = null;

async function loginOwner() {
  try {
    console.log('🔐 Logging in as owner...');
    const response = await axios.post(`${API_BASE_URL}/account/login`, {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    });

    ownerToken = response.data.token;
    console.log('✅ Owner logged in successfully\n');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function getOwnerReviews() {
  try {
    console.log('📋 Test 1: Getting owner reviews...');
    const response = await axios.get(`${API_BASE_URL}/reviews/owner/my-reviews`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      params: {
        status: 'visible',
        page: 1,
        limit: 10,
      },
    });

    console.log('✅ Owner reviews retrieved');
    console.log(`   Total reviews: ${response.data.total}`);
    console.log(`   Reviews with reply: ${response.data.stats.reviewsWithReply}`);
    console.log(`   Reviews without reply: ${response.data.stats.reviewsWithoutReply}`);
    console.log(`   Reply rate: ${response.data.stats.replyRate}%`);
    console.log(`   Average rating: ${response.data.stats.averageRating}`);

    // Find a review without a reply for testing
    const reviewWithoutReply = response.data.reviews.find(r => !r.ownerReply || !r.ownerReply.text);
    if (reviewWithoutReply) {
      testReviewId = reviewWithoutReply._id;
      console.log(`   Found review without reply: ${testReviewId}\n`);
    } else {
      // Use the first review for testing
      if (response.data.reviews.length > 0) {
        testReviewId = response.data.reviews[0]._id;
        console.log(`   Using existing review: ${testReviewId}\n`);
      } else {
        console.log('   ⚠️ No reviews found for this owner\n');
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function createReply() {
  if (!testReviewId) {
    console.log('⏭️ Test 2: Skipped (no review available)\n');
    return true;
  }

  try {
    console.log('💬 Test 2: Creating owner reply...');
    const response = await axios.post(
      `${API_BASE_URL}/reviews/${testReviewId}/reply`,
      {
        text: 'Thank you for your feedback! We appreciate your business and hope to see you again soon.',
      },
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );

    console.log('✅ Reply created successfully');
    console.log(`   Reply text: "${response.data.review.ownerReply.text}"`);
    console.log(`   Created at: ${response.data.review.ownerReply.createdAt}\n`);
    return true;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    if (errorMsg.includes('Reply already exists')) {
      console.log('   ℹ️ Reply already exists, will test update instead\n');
      return true;
    }
    console.error('❌ Failed:', errorMsg);
    return false;
  }
}

async function updateReply() {
  if (!testReviewId) {
    console.log('⏭️ Test 3: Skipped (no review available)\n');
    return true;
  }

  try {
    console.log('✏️ Test 3: Updating owner reply...');
    const response = await axios.put(
      `${API_BASE_URL}/reviews/${testReviewId}/reply`,
      {
        text: 'Thank you for your feedback! We have made improvements based on your suggestions. Looking forward to your next visit!',
      },
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );

    console.log('✅ Reply updated successfully');
    console.log(`   New reply text: "${response.data.review.ownerReply.text}"`);
    console.log(`   Updated at: ${response.data.review.ownerReply.updatedAt}`);
    console.log(`   Is edited: ${response.data.review.ownerReply.isEdited}\n`);
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testValidation() {
  if (!testReviewId) {
    console.log('⏭️ Test 4: Skipped (no review available)\n');
    return true;
  }

  try {
    console.log('📏 Test 4: Testing validation (reply too short)...');
    await axios.put(
      `${API_BASE_URL}/reviews/${testReviewId}/reply`,
      {
        text: 'Hi',
      },
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );

    console.log('   ❌ FAILED: Should reject short reply\n');
    return false;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    console.log(`   ✅ Correctly rejected: ${errorMsg}\n`);
    return true;
  }
}

async function testValidationLong() {
  if (!testReviewId) {
    console.log('⏭️ Test 5: Skipped (no review available)\n');
    return true;
  }

  try {
    console.log('📏 Test 5: Testing validation (reply too long)...');
    const longReply = 'A'.repeat(301);
    await axios.put(
      `${API_BASE_URL}/reviews/${testReviewId}/reply`,
      {
        text: longReply,
      },
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );

    console.log('   ❌ FAILED: Should reject long reply\n');
    return false;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    console.log(`   ✅ Correctly rejected: ${errorMsg}\n`);
    return true;
  }
}

async function filterReviewsWithoutReply() {
  try {
    console.log('🔍 Test 6: Filtering reviews without reply...');
    const response = await axios.get(`${API_BASE_URL}/reviews/owner/my-reviews`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      params: {
        hasReply: false,
        status: 'visible',
      },
    });

    console.log('✅ Filtered reviews retrieved');
    console.log(`   Reviews without reply: ${response.data.total}\n`);
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Owner Reply API Tests\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // Login
  if (!await loginOwner()) {
    console.log('❌ Cannot proceed without authentication');
    return;
  }

  // Run tests
  const tests = [
    getOwnerReviews,
    createReply,
    updateReply,
    testValidation,
    testValidationLong,
    filterReviewsWithoutReply,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await test();
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️ Some tests failed. Please review the output above.');
  }
}

// Run tests
runTests();
