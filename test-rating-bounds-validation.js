// test-rating-bounds-validation.js
// Test rating bounds validation for review submission and updates

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test user credentials (you'll need to use actual test credentials)
const TEST_USER = {
  email: 'testclient@example.com',
  password: 'password123'
};

let authToken = null;
let testBookingId = null;
let testReviewId = null;

async function login() {
  try {
    console.log('\n=== Logging in as test user ===');
    const response = await axios.post(`${API_BASE}/account/login`, TEST_USER);
    authToken = response.data.token;
    console.log('✓ Login successful');
    return authToken;
  } catch (error) {
    console.error('✗ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getEligibleBooking() {
  try {
    console.log('\n=== Finding eligible booking ===');
    const response = await axios.get(`${API_BASE}/bookings/me`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const bookings = response.data.bookings || response.data;
    
    // Find a completed or past booking without a review
    const eligibleBooking = bookings.find(b => {
      const isPast = new Date(b.endDate || b.to) < new Date();
      const isCompleted = b.status === 'completed' || (b.status === 'paid' && isPast);
      return isCompleted && !b.hasReview;
    });
    
    if (eligibleBooking) {
      testBookingId = eligibleBooking._id;
      console.log('✓ Found eligible booking:', testBookingId);
      return testBookingId;
    } else {
      console.log('✗ No eligible bookings found');
      return null;
    }
  } catch (error) {
    console.error('✗ Failed to get bookings:', error.response?.data || error.message);
    throw error;
  }
}

async function testValidRating() {
  console.log('\n=== Test 1: Valid rating (1-5) ===');
  
  const validRatings = [1, 2, 3, 4, 5];
  
  for (const rating of validRatings) {
    try {
      console.log(`Testing rating: ${rating}`);
      const response = await axios.post(
        `${API_BASE}/reviews/booking/${testBookingId}`,
        {
          rating: rating,
          comment: 'This is a test review with valid rating'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      console.log(`✓ Rating ${rating} accepted`);
      testReviewId = response.data.id;
      
      // Delete the review for next test
      if (testReviewId) {
        await axios.delete(`${API_BASE}/reviews/${testReviewId}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
      }
    } catch (error) {
      console.error(`✗ Rating ${rating} rejected:`, error.response?.data?.message || error.message);
    }
  }
}

async function testInvalidRatingBounds() {
  console.log('\n=== Test 2: Invalid rating bounds (0, 6, etc.) ===');
  
  const invalidRatings = [0, 6, -1, 10, 100];
  
  for (const rating of invalidRatings) {
    try {
      console.log(`Testing rating: ${rating}`);
      const response = await axios.post(
        `${API_BASE}/reviews/booking/${testBookingId}`,
        {
          rating: rating,
          comment: 'This is a test review with invalid rating'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      console.error(`✗ Rating ${rating} was incorrectly accepted!`);
    } catch (error) {
      if (error.response?.status === 400) {
        console.log(`✓ Rating ${rating} correctly rejected:`, error.response.data.message);
      } else {
        console.error(`✗ Unexpected error for rating ${rating}:`, error.response?.data || error.message);
      }
    }
  }
}

async function testNonIntegerRatings() {
  console.log('\n=== Test 3: Non-integer ratings (decimals, strings) ===');
  
  const nonIntegerRatings = [3.5, 4.2, '3', 'five', null, undefined, NaN];
  
  for (const rating of nonIntegerRatings) {
    try {
      console.log(`Testing rating: ${rating} (type: ${typeof rating})`);
      const response = await axios.post(
        `${API_BASE}/reviews/booking/${testBookingId}`,
        {
          rating: rating,
          comment: 'This is a test review with non-integer rating'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      console.error(`✗ Rating ${rating} was incorrectly accepted!`);
    } catch (error) {
      if (error.response?.status === 400) {
        console.log(`✓ Rating ${rating} correctly rejected:`, error.response.data.message);
      } else {
        console.error(`✗ Unexpected error for rating ${rating}:`, error.response?.data || error.message);
      }
    }
  }
}

async function testMissingRating() {
  console.log('\n=== Test 4: Missing rating ===');
  
  try {
    const response = await axios.post(
      `${API_BASE}/reviews/booking/${testBookingId}`,
      {
        comment: 'This is a test review without rating'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.error('✗ Review without rating was incorrectly accepted!');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✓ Review without rating correctly rejected:', error.response.data.message);
    } else {
      console.error('✗ Unexpected error:', error.response?.data || error.message);
    }
  }
}

async function testUpdateWithInvalidRating() {
  console.log('\n=== Test 5: Update review with invalid rating ===');
  
  // First create a valid review
  try {
    const createResponse = await axios.post(
      `${API_BASE}/reviews/booking/${testBookingId}`,
      {
        rating: 4,
        comment: 'Initial review for update test'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    testReviewId = createResponse.data.id;
    console.log('✓ Created review for update test:', testReviewId);
    
    // Try to update with invalid ratings
    const invalidRatings = [0, 6, 3.5, 'invalid'];
    
    for (const rating of invalidRatings) {
      try {
        console.log(`Attempting to update with rating: ${rating}`);
        await axios.put(
          `${API_BASE}/reviews/${testReviewId}`,
          {
            rating: rating,
            comment: 'Updated comment'
          },
          {
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        
        console.error(`✗ Update with rating ${rating} was incorrectly accepted!`);
      } catch (error) {
        if (error.response?.status === 400) {
          console.log(`✓ Update with rating ${rating} correctly rejected:`, error.response.data.message);
        } else {
          console.error(`✗ Unexpected error for rating ${rating}:`, error.response?.data || error.message);
        }
      }
    }
    
    // Clean up
    await axios.delete(`${API_BASE}/reviews/${testReviewId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✓ Cleaned up test review');
    
  } catch (error) {
    console.error('✗ Update test failed:', error.response?.data || error.message);
  }
}

async function runTests() {
  try {
    console.log('=================================================');
    console.log('   Rating Bounds Validation Test Suite');
    console.log('=================================================');
    
    await login();
    
    const bookingId = await getEligibleBooking();
    if (!bookingId) {
      console.log('\n⚠ No eligible bookings found. Please create a completed booking first.');
      console.log('You can use the test-review-eligibility.js script to create test data.');
      return;
    }
    
    await testValidRating();
    await testInvalidRatingBounds();
    await testNonIntegerRatings();
    await testMissingRating();
    await testUpdateWithInvalidRating();
    
    console.log('\n=================================================');
    console.log('   Test Suite Complete');
    console.log('=================================================');
    
  } catch (error) {
    console.error('\n✗ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
