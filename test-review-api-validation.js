// test-review-api-validation.js
// Integration test for review API endpoint validation

const mongoose = require("mongoose");
const express = require("express");
const request = require("supertest");
require("dotenv").config();

const Booking = require("./src/models/Booking");
const User = require("./src/models/User");
const Listing = require("./src/models/Listing");
const Review = require("./src/models/Review");

// Import the controller
const reviewsController = require("./src/controllers/reviews.controller");

// Create a minimal Express app for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware
  app.use((req, res, next) => {
    req.user = req.testUser || {};
    next();
  });
  
  app.post("/reviews/booking/:bookingId", reviewsController.createForBooking);
  
  return app;
}

async function testReviewAPIValidation() {
  const timeout = setTimeout(() => {
    console.log("\n✗ Test timed out after 30 seconds");
    process.exit(1);
  }, 30000);

  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Find a test user
    const user = await User.findOne();
    if (!user) {
      console.log("✗ No users found. Please create a user first.");
      return;
    }
    console.log(`✓ Using test user: ${user.email || user._id}\n`);

    // Find a test listing
    const listing = await Listing.findOne();
    if (!listing) {
      console.log("✗ No listings found. Please create a listing first.");
      return;
    }
    console.log(`✓ Using test listing: ${listing.venue || listing._id}\n`);

    const app = createTestApp();

    // Test scenarios
    const scenarios = [
      {
        name: "Cancelled booking",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "cancelled",
        },
        expectedStatus: 400,
        expectedMessage: "You cannot review cancelled bookings.",
      },
      {
        name: "Pending payment booking",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "pending_payment",
        },
        expectedStatus: 400,
        expectedMessage: "You cannot review bookings with pending payment.",
      },
      {
        name: "Future paid booking",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "paid",
        },
        expectedStatus: 400,
        expectedMessage: "You can only review completed or past bookings.",
      },
      {
        name: "Past paid booking (should succeed)",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "paid",
        },
        expectedStatus: 200,
        expectedMessage: null,
      },
      {
        name: "Completed booking (should succeed)",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "completed",
        },
        expectedStatus: 200,
        expectedMessage: null,
      },
    ];

    console.log("=".repeat(80));
    console.log("TESTING REVIEW API ENDPOINT VALIDATION");
    console.log("=".repeat(80) + "\n");

    let passCount = 0;
    let failCount = 0;

    for (const scenario of scenarios) {
      console.log(`\nTest: ${scenario.name}`);
      console.log(`Expected status: ${scenario.expectedStatus}`);
      if (scenario.expectedMessage) {
        console.log(`Expected message: ${scenario.expectedMessage}`);
      }

      // Create test booking
      const booking = await Booking.create(scenario.booking);
      console.log(`✓ Created test booking: ${booking._id}`);

      // Make API request
      const response = await request(app)
        .post(`/reviews/booking/${booking._id}`)
        .set("testUser", JSON.stringify({ _id: user._id, uid: user._id }))
        .send({
          rating: 5,
          comment: "Test review",
        });

      // Check response
      const statusMatch = response.status === scenario.expectedStatus;
      const messageMatch = !scenario.expectedMessage || 
        (response.body.message && response.body.message.includes(scenario.expectedMessage));

      if (statusMatch && messageMatch) {
        console.log(`✓ PASS: API returned expected status ${response.status}`);
        if (scenario.expectedMessage) {
          console.log(`  Message: ${response.body.message}`);
        }
        passCount++;
      } else {
        console.log(`✗ FAIL:`);
        if (!statusMatch) {
          console.log(`  Expected status ${scenario.expectedStatus}, got ${response.status}`);
        }
        if (!messageMatch) {
          console.log(`  Expected message containing "${scenario.expectedMessage}"`);
          console.log(`  Got: ${response.body.message}`);
        }
        failCount++;
      }

      // Clean up
      await Booking.findByIdAndDelete(booking._id);
      
      // Clean up any created reviews
      if (response.status === 200 && response.body.id) {
        await Review.findByIdAndDelete(response.body.id);
      }
      
      console.log(`✓ Cleaned up test data`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total tests: ${scenarios.length}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Success rate: ${((passCount / scenarios.length) * 100).toFixed(1)}%`);

    if (failCount === 0) {
      console.log("\n✓ All API tests passed! Review endpoint validation is working correctly.");
    } else {
      console.log("\n✗ Some API tests failed. Please review the implementation.");
    }

  } catch (error) {
    console.error("✗ Error during testing:", error.message);
    console.error(error);
  } finally {
    clearTimeout(timeout);
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
    process.exit(0);
  }
}

testReviewAPIValidation();
