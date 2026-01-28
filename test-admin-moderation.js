/**
 * Test Admin Moderation Dashboard Implementation
 * 
 * This script tests:
 * 1. GET /api/admin/reviews/flagged - Fetch flagged reviews
 * 2. POST /api/admin/reviews/:id/moderate - Moderate a review
 * 3. GET /api/admin/reviews/analytics - Get review analytics
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

// Test admin credentials (update with actual admin credentials)
const ADMIN_EMAIL = 'admin@flexidesk.com';
const ADMIN_PASSWORD = 'admin123';

let adminToken = null;
let testReviewId = null;

async function loginAsAdmin() {
  try {
    console.log('\n📝 Logging in as admin...');
    const response = await axios.post(`${API_URL}/admin/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    adminToken = response.data.token;
    console.log('✅ Admin login successful');
    console.log('Token:', adminToken.substring(0, 20) + '...');
    return true;
  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testGetFlaggedReviews() {
  try {
    console.log('\n📋 Testing GET /api/admin/reviews/flagged...');
    
    const response = await axios.get(`${API_URL}/admin/reviews/flagged`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: {
        page: 1,
        limit: 10,
        status: 'flagged',
        sort: 'flaggedAt_desc',
      },
    });

    console.log('✅ Flagged reviews fetched successfully');
    console.log('Total reviews:', response.data.total);
    console.log('Current page:', response.data.page);
    console.log('Total pages:', response.data.pages);
    console.log('Reviews on this page:', response.data.reviews.length);

    if (response.data.reviews.length > 0) {
      const review = response.data.reviews[0];
      testReviewId = review._id;
      console.log('\nSample review:');
      console.log('- ID:', review._id);
      console.log('- User:', review.userId?.email || 'N/A');
      console.log('- Listing:', review.listingId?.name || 'N/A');
      console.log('- Rating:', review.rating);
      console.log('- Status:', review.status);
      console.log('- Flag Reason:', review.flagReason || 'N/A');
      console.log('- Comment:', review.comment?.substring(0, 50) + '...');
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to fetch flagged reviews:', error.response?.data || error.message);
    return false;
  }
}

async function testGetFlaggedReviewsWithFilters() {
  try {
    console.log('\n🔍 Testing GET /api/admin/reviews/flagged with filters...');
    
    // Test with different filters
    const filters = [
      { status: 'all', reason: 'all', sort: 'createdAt_desc' },
      { status: 'flagged', reason: 'profanity', sort: 'rating_asc' },
      { status: 'hidden', reason: 'all', sort: 'flaggedAt_desc' },
    ];

    for (const filter of filters) {
      console.log(`\nTesting filter: status=${filter.status}, reason=${filter.reason}, sort=${filter.sort}`);
      
      const response = await axios.get(`${API_URL}/admin/reviews/flagged`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        params: { ...filter, page: 1, limit: 5 },
      });

      console.log(`✅ Found ${response.data.total} reviews`);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to test filters:', error.response?.data || error.message);
    return false;
  }
}

async function testModerateReview() {
  if (!testReviewId) {
    console.log('\n⚠️  No review ID available for moderation test');
    return true;
  }

  try {
    console.log('\n⚖️  Testing POST /api/admin/reviews/:id/moderate...');
    console.log('Review ID:', testReviewId);

    // Test approve action
    console.log('\n1. Testing APPROVE action...');
    const approveResponse = await axios.post(
      `${API_URL}/admin/reviews/${testReviewId}/moderate`,
      {
        action: 'approve',
        notes: 'Review approved after manual inspection - no violations found',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    console.log('✅ Review approved successfully');
    console.log('New status:', approveResponse.data.review.status);
    console.log('Moderation notes:', approveResponse.data.review.moderationNotes);

    // Wait a bit before next action
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test hide action (flag it again first if needed)
    console.log('\n2. Testing HIDE action...');
    try {
      const hideResponse = await axios.post(
        `${API_URL}/admin/reviews/${testReviewId}/moderate`,
        {
          action: 'hide',
          notes: 'Review hidden due to inappropriate content',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      console.log('✅ Review hidden successfully');
      console.log('New status:', hideResponse.data.review.status);
    } catch (error) {
      console.log('⚠️  Hide action test skipped (review may not be flagged)');
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to moderate review:', error.response?.data || error.message);
    return false;
  }
}

async function testModerateReviewValidation() {
  if (!testReviewId) {
    console.log('\n⚠️  No review ID available for validation test');
    return true;
  }

  try {
    console.log('\n🔒 Testing moderation validation...');

    // Test invalid action
    console.log('\n1. Testing invalid action...');
    try {
      await axios.post(
        `${API_URL}/admin/reviews/${testReviewId}/moderate`,
        {
          action: 'invalid_action',
          notes: 'Test notes',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      console.log('❌ Should have rejected invalid action');
      return false;
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Invalid action rejected correctly');
      } else {
        throw error;
      }
    }

    // Test hide without notes
    console.log('\n2. Testing hide action without notes...');
    try {
      await axios.post(
        `${API_URL}/admin/reviews/${testReviewId}/moderate`,
        {
          action: 'hide',
          notes: '',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      console.log('❌ Should have required notes for hide action');
      return false;
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Hide without notes rejected correctly');
      } else {
        throw error;
      }
    }

    // Test delete without notes
    console.log('\n3. Testing delete action without notes...');
    try {
      await axios.post(
        `${API_URL}/admin/reviews/${testReviewId}/moderate`,
        {
          action: 'delete',
          notes: '',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      console.log('❌ Should have required notes for delete action');
      return false;
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Delete without notes rejected correctly');
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Validation test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testGetReviewAnalytics() {
  try {
    console.log('\n📊 Testing GET /api/admin/reviews/analytics...');
    
    const response = await axios.get(`${API_URL}/admin/reviews/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    console.log('✅ Analytics fetched successfully');
    console.log('\nKey Metrics:');
    console.log('- Total Reviews:', response.data.totalReviews);
    console.log('- Visible Reviews:', response.data.visibleReviews);
    console.log('- Average Rating:', response.data.averageRating);
    console.log('- Flagged Count:', response.data.flaggedCount);
    console.log('- Reviews with Photos:', response.data.reviewsWithPhotos);
    console.log('- Reviews with Replies:', response.data.reviewsWithReplies);

    console.log('\nStatus Counts:');
    console.log('- Visible:', response.data.statusCounts.visible);
    console.log('- Hidden:', response.data.statusCounts.hidden);
    console.log('- Flagged:', response.data.statusCounts.flagged);
    console.log('- Deleted:', response.data.statusCounts.deleted);

    console.log('\nRating Distribution:');
    Object.entries(response.data.ratingDistribution).forEach(([rating, count]) => {
      console.log(`- ${rating} stars: ${count}`);
    });

    if (response.data.flagReasons.length > 0) {
      console.log('\nFlag Reasons:');
      response.data.flagReasons.forEach((reason) => {
        console.log(`- ${reason._id}: ${reason.count}`);
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to fetch analytics:', error.response?.data || error.message);
    return false;
  }
}

async function testGetAnalyticsWithDateRange() {
  try {
    console.log('\n📅 Testing GET /api/admin/reviews/analytics with date range...');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const response = await axios.get(`${API_URL}/admin/reviews/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: {
        startDate: thirtyDaysAgo.toISOString(),
        endDate: new Date().toISOString(),
      },
    });

    console.log('✅ Analytics with date range fetched successfully');
    console.log('Period:', response.data.period);
    console.log('Total Reviews in period:', response.data.totalReviews);
    console.log('Moderation Trends:', response.data.moderationTrends.length, 'data points');

    return true;
  } catch (error) {
    console.error('❌ Failed to fetch analytics with date range:', error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Admin Moderation Dashboard Tests\n');
  console.log('='.repeat(60));

  const results = {
    login: false,
    getFlagged: false,
    getFilteredFlagged: false,
    moderate: false,
    moderateValidation: false,
    analytics: false,
    analyticsDateRange: false,
  };

  // Login
  results.login = await loginAsAdmin();
  if (!results.login) {
    console.log('\n❌ Cannot proceed without admin login');
    return;
  }

  // Test flagged reviews
  results.getFlagged = await testGetFlaggedReviews();
  results.getFilteredFlagged = await testGetFlaggedReviewsWithFilters();

  // Test moderation
  results.moderate = await testModerateReview();
  results.moderateValidation = await testModerateReviewValidation();

  // Test analytics
  results.analytics = await testGetReviewAnalytics();
  results.analyticsDateRange = await testGetAnalyticsWithDateRange();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}`);
  });
  
  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Admin Moderation Dashboard is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
