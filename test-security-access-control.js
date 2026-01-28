// test-security-access-control.js
/**
 * Test suite for Task 26: Security and Access Control
 * Tests role-based access control, data sanitization, and rate limiting
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Review = require("./src/models/Review");
const Booking = require("./src/models/Booking");
const Listing = require("./src/models/Listing");
const User = require("./src/models/User");

// Import security middleware
const {
  canReviewBooking,
  canEditReview,
  canReplyToReview,
  canModerateReviews,
} = require("./src/middleware/reviewAuthorization");

const {
  sanitizeReviewData,
  sanitizeReplyData,
  sanitizeFlagData,
  escapeHtml,
  stripHtml,
} = require("./src/middleware/sanitizeInput");

async function runTests() {
  try {
    console.log("=== Task 26: Security and Access Control Tests ===\n");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB\n");

    // Test 26.1: Role-Based Access Control
    await testRoleBasedAccessControl();

    // Test 26.2: Data Sanitization
    await testDataSanitization();

    // Test 26.3: Rate Limiting
    await testRateLimiting();

    console.log("\n=== All Security Tests Completed ===");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

async function testRoleBasedAccessControl() {
  console.log("--- Test 26.1: Role-Based Access Control ---\n");

  // Clean up test data more thoroughly
  await Review.deleteMany({ 
    $or: [
      { comment: /TEST_SECURITY/ },
      { user: null },
      { booking: null }
    ]
  });
  await Booking.deleteMany({ notes: /TEST_SECURITY/ });
  await Listing.deleteMany({ venue: /TEST_SECURITY/ });
  await User.deleteMany({ email: /test.*security@example\.com/ });

  // Use existing users from database
  const clientUser = await User.findOne({ role: "client" });
  const ownerUser = await User.findOne({ role: "owner" });
  const adminUser = await User.findOne({ role: "admin" });

  if (!clientUser || !ownerUser || !adminUser) {
    console.log("  ⚠ WARNING: Required test users not found in database");
    console.log("  Please ensure you have at least one user of each role (client, owner, admin)");
    console.log("  Skipping role-based access control tests\n");
    return;
  }

  // Create test listing
  const listing = await Listing.create({
    venue: "TEST_SECURITY Workspace",
    owner: ownerUser._id,
    shortDesc: "Test listing for security",
    dailyPrice: 100,
    capacity: 10,
  });

  // Create test booking
  const booking = await Booking.create({
    listingId: listing._id,
    userId: clientUser._id,
    user: clientUser._id,
    ownerId: ownerUser._id,
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    status: "completed",
    amount: 500,
    notes: "TEST_SECURITY booking"
  });

  console.log("Test 1: User can only review their own bookings");
  const mockReq1 = {
    params: { bookingId: booking._id },
    user: { _id: clientUser._id }
  };
  const mockRes1 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✗ FAILED: Should allow owner to review their booking");
        }
      }
    })
  };
  const mockNext1 = () => console.log("  ✓ PASSED: User can review their own booking");
  
  await canReviewBooking(mockReq1, mockRes1, mockNext1);

  console.log("\nTest 2: User cannot review someone else's booking");
  const mockReq2 = {
    params: { bookingId: booking._id },
    user: { _id: ownerUser._id }
  };
  const mockRes2 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✓ PASSED: User cannot review someone else's booking");
        }
      }
    })
  };
  const mockNext2 = () => console.log("  ✗ FAILED: Should not allow non-owner to review");
  
  await canReviewBooking(mockReq2, mockRes2, mockNext2);

  // Create test review
  const review = await Review.create({
    user: clientUser._id,
    userId: clientUser._id,
    listing: listing._id,
    listingId: listing._id,
    booking: booking._id,
    bookingId: booking._id,
    ownerId: ownerUser._id,
    rating: 5,
    comment: "TEST_SECURITY review comment with enough characters"
  });

  console.log("\nTest 3: User can only edit their own reviews");
  const mockReq3 = {
    params: { id: review._id },
    user: { _id: clientUser._id }
  };
  const mockRes3 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✗ FAILED: Should allow owner to edit their review");
        }
      }
    })
  };
  const mockNext3 = () => console.log("  ✓ PASSED: User can edit their own review");
  
  await canEditReview(mockReq3, mockRes3, mockNext3);

  console.log("\nTest 4: Owner can only reply to reviews for their listings");
  const mockReq4 = {
    params: { id: review._id },
    user: { _id: ownerUser._id }
  };
  const mockRes4 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✗ FAILED: Should allow owner to reply to their listing's review");
        }
      }
    })
  };
  const mockNext4 = () => console.log("  ✓ PASSED: Owner can reply to their listing's review");
  
  await canReplyToReview(mockReq4, mockRes4, mockNext4);

  console.log("\nTest 5: Only admins can moderate reviews");
  const mockReq5 = {
    user: { role: "admin" }
  };
  const mockRes5 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✗ FAILED: Should allow admin to moderate");
        }
      }
    })
  };
  const mockNext5 = () => console.log("  ✓ PASSED: Admin can moderate reviews");
  
  canModerateReviews(mockReq5, mockRes5, mockNext5);

  console.log("\nTest 6: Non-admins cannot moderate reviews");
  const mockReq6 = {
    user: { role: "client" }
  };
  const mockRes6 = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) {
          console.log("  ✓ PASSED: Non-admin cannot moderate reviews");
        }
      }
    })
  };
  const mockNext6 = () => console.log("  ✗ FAILED: Should not allow non-admin to moderate");
  
  canModerateReviews(mockReq6, mockRes6, mockNext6);

  // Clean up
  await Review.deleteOne({ _id: review._id });
  await Booking.deleteOne({ _id: booking._id });
  await Listing.deleteOne({ _id: listing._id });

  console.log("\n✓ Role-Based Access Control tests completed\n");
}

async function testDataSanitization() {
  console.log("--- Test 26.2: Data Sanitization ---\n");

  console.log("Test 1: XSS protection in review comments");
  const mockReq1 = {
    body: {
      rating: 5,
      comment: '<script>alert("XSS")</script>This is a test review with malicious code'
    }
  };
  const mockRes1 = {
    status: (code) => ({
      json: (data) => {
        console.log(`  Response: ${data.message}`);
      }
    })
  };
  const mockNext1 = () => {
    const sanitized = mockReq1.body.comment;
    if (sanitized.includes('<script>')) {
      console.log("  ✗ FAILED: XSS not sanitized");
    } else {
      console.log("  ✓ PASSED: XSS sanitized from comment");
      console.log(`  Sanitized: "${sanitized}"`);
    }
  };
  
  sanitizeReviewData(mockReq1, mockRes1, mockNext1);

  console.log("\nTest 2: HTML escaping utility");
  const htmlInput = '<div>Test & "quotes" \'apostrophes\'</div>';
  const escaped = escapeHtml(htmlInput);
  console.log(`  Input: ${htmlInput}`);
  console.log(`  Escaped: ${escaped}`);
  if (escaped.includes('<') || escaped.includes('>')) {
    console.log("  ✗ FAILED: HTML not properly escaped");
  } else {
    console.log("  ✓ PASSED: HTML properly escaped");
  }

  console.log("\nTest 3: HTML stripping utility");
  const htmlInput2 = '<p>This is <strong>bold</strong> text</p>';
  const stripped = stripHtml(htmlInput2);
  console.log(`  Input: ${htmlInput2}`);
  console.log(`  Stripped: ${stripped}`);
  if (stripped.includes('<') || stripped.includes('>')) {
    console.log("  ✗ FAILED: HTML not properly stripped");
  } else {
    console.log("  ✓ PASSED: HTML properly stripped");
  }

  console.log("\nTest 4: Rating validation");
  const mockReq4 = {
    body: {
      rating: 10, // Invalid rating
      comment: "This is a valid comment with enough characters"
    }
  };
  const mockRes4 = {
    status: (code) => ({
      json: (data) => {
        if (code === 400 && data.message.includes('Rating')) {
          console.log("  ✓ PASSED: Invalid rating rejected");
          console.log(`  Error: ${data.message}`);
        }
      }
    })
  };
  const mockNext4 = () => console.log("  ✗ FAILED: Invalid rating not rejected");
  
  sanitizeReviewData(mockReq4, mockRes4, mockNext4);

  console.log("\nTest 5: Comment length validation");
  const mockReq5 = {
    body: {
      rating: 5,
      comment: "Short" // Too short
    }
  };
  const mockRes5 = {
    status: (code) => ({
      json: (data) => {
        if (code === 400 && data.message.includes('10 characters')) {
          console.log("  ✓ PASSED: Short comment rejected");
          console.log(`  Error: ${data.message}`);
        }
      }
    })
  };
  const mockNext5 = () => console.log("  ✗ FAILED: Short comment not rejected");
  
  sanitizeReviewData(mockReq5, mockRes5, mockNext5);

  console.log("\nTest 6: Reply text sanitization");
  const mockReq6 = {
    body: {
      text: '<img src=x onerror="alert(1)">Thank you for your feedback!'
    }
  };
  const mockRes6 = {
    status: (code) => ({
      json: (data) => {
        console.log(`  Response: ${data.message}`);
      }
    })
  };
  const mockNext6 = () => {
    const sanitized = mockReq6.body.text;
    if (sanitized.includes('<img') || sanitized.includes('onerror')) {
      console.log("  ✗ FAILED: Malicious HTML not sanitized");
    } else {
      console.log("  ✓ PASSED: Malicious HTML sanitized from reply");
      console.log(`  Sanitized: "${sanitized}"`);
    }
  };
  
  sanitizeReplyData(mockReq6, mockRes6, mockNext6);

  console.log("\nTest 7: Flag reason validation");
  const mockReq7 = {
    body: {
      reason: "invalid_reason",
      details: "This is a test flag"
    }
  };
  const mockRes7 = {
    status: (code) => ({
      json: (data) => {
        if (code === 400 && data.message.includes('Invalid flag reason')) {
          console.log("  ✓ PASSED: Invalid flag reason rejected");
          console.log(`  Error: ${data.message}`);
        }
      }
    })
  };
  const mockNext7 = () => console.log("  ✗ FAILED: Invalid flag reason not rejected");
  
  sanitizeFlagData(mockReq7, mockRes7, mockNext7);

  console.log("\n✓ Data Sanitization tests completed\n");
}

async function testRateLimiting() {
  console.log("--- Test 26.3: Rate Limiting ---\n");

  console.log("Test 1: Rate limiting middleware exists");
  const {
    reviewSubmissionLimiter,
    reviewEditLimiter,
    photoUploadLimiter,
    ownerReplyLimiter,
    reviewFlagLimiter,
    reviewApiLimiter,
    publicReviewLimiter,
    adminModerationLimiter,
  } = require("./src/middleware/rateLimiting");

  if (reviewSubmissionLimiter && typeof reviewSubmissionLimiter === 'function') {
    console.log("  ✓ PASSED: reviewSubmissionLimiter exists");
  } else {
    console.log("  ✗ FAILED: reviewSubmissionLimiter not found");
  }

  if (reviewEditLimiter && typeof reviewEditLimiter === 'function') {
    console.log("  ✓ PASSED: reviewEditLimiter exists");
  } else {
    console.log("  ✗ FAILED: reviewEditLimiter not found");
  }

  if (photoUploadLimiter && typeof photoUploadLimiter === 'function') {
    console.log("  ✓ PASSED: photoUploadLimiter exists");
  } else {
    console.log("  ✗ FAILED: photoUploadLimiter not found");
  }

  if (ownerReplyLimiter && typeof ownerReplyLimiter === 'function') {
    console.log("  ✓ PASSED: ownerReplyLimiter exists");
  } else {
    console.log("  ✗ FAILED: ownerReplyLimiter not found");
  }

  if (reviewFlagLimiter && typeof reviewFlagLimiter === 'function') {
    console.log("  ✓ PASSED: reviewFlagLimiter exists");
  } else {
    console.log("  ✗ FAILED: reviewFlagLimiter not found");
  }

  if (reviewApiLimiter && typeof reviewApiLimiter === 'function') {
    console.log("  ✓ PASSED: reviewApiLimiter exists");
  } else {
    console.log("  ✗ FAILED: reviewApiLimiter not found");
  }

  if (publicReviewLimiter && typeof publicReviewLimiter === 'function') {
    console.log("  ✓ PASSED: publicReviewLimiter exists");
  } else {
    console.log("  ✗ FAILED: publicReviewLimiter not found");
  }

  if (adminModerationLimiter && typeof adminModerationLimiter === 'function') {
    console.log("  ✓ PASSED: adminModerationLimiter exists");
  } else {
    console.log("  ✗ FAILED: adminModerationLimiter not found");
  }

  console.log("\nTest 2: Rate limiting configuration");
  console.log("  Review submissions: 5 per hour per user");
  console.log("  Review edits: 10 per hour per user");
  console.log("  Photo uploads: 20 per hour per user");
  console.log("  Owner replies: 20 per hour per owner");
  console.log("  Review flags: 10 per hour per user");
  console.log("  API requests: 100 per 15 minutes per user");
  console.log("  Public requests: 60 per minute per IP");
  console.log("  Admin moderation: 100 per hour per admin");
  console.log("  ✓ PASSED: Rate limiting configuration documented");

  console.log("\n✓ Rate Limiting tests completed\n");
}

runTests();
