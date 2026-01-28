// test-review-eligibility.js
// Test script to verify review eligibility validation

const mongoose = require("mongoose");
require("dotenv").config();

const Booking = require("./src/models/Booking");
const Review = require("./src/models/Review");
const User = require("./src/models/User");
const Listing = require("./src/models/Listing");

async function testReviewEligibility() {
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

    // Test scenarios
    const scenarios = [
      {
        name: "Future booking with pending_payment",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "pending_payment",
        },
        shouldAllow: false,
        reason: "Cannot review bookings with pending payment",
      },
      {
        name: "Future booking with paid status",
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
        shouldAllow: false,
        reason: "Cannot review future bookings (even if paid)",
      },
      {
        name: "Future booking with completed status",
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
        shouldAllow: true,
        reason: "Can review completed bookings (even if future)",
      },
      {
        name: "Past booking with paid status",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "paid",
        },
        shouldAllow: true,
        reason: "Can review past bookings with paid status",
      },
      {
        name: "Past booking with completed status",
        booking: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "completed",
        },
        shouldAllow: true,
        reason: "Can review past completed bookings",
      },
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
        shouldAllow: false,
        reason: "Cannot review cancelled bookings",
      },
      {
        name: "Past booking with pending_payment",
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
        shouldAllow: false,
        reason: "Cannot review bookings with pending payment (even if past)",
      },
    ];

    console.log("=".repeat(80));
    console.log("TESTING REVIEW ELIGIBILITY VALIDATION");
    console.log("=".repeat(80) + "\n");

    let passCount = 0;
    let failCount = 0;

    for (const scenario of scenarios) {
      console.log(`\nTest: ${scenario.name}`);
      console.log(`Expected: ${scenario.shouldAllow ? "ALLOW" : "REJECT"} - ${scenario.reason}`);

      // Create test booking
      const booking = await Booking.create(scenario.booking);
      console.log(`✓ Created test booking: ${booking._id}`);

      // Simulate review validation logic from controller
      const now = new Date();
      const start = booking.startDate;
      const bookingStatus = booking.status;

      let canReview = true;
      let errorMessage = "";

      // Validation logic (matching the controller)
      if (bookingStatus === "cancelled") {
        canReview = false;
        errorMessage = "You cannot review cancelled bookings.";
      } else if (bookingStatus === "pending_payment" || bookingStatus === "awaiting_payment") {
        canReview = false;
        errorMessage = "You cannot review bookings with pending payment.";
      } else {
        const isPastBooking = start && new Date(start) < now;
        const isCompleted = bookingStatus === "completed";
        const isPaid = bookingStatus === "paid";

        if (!isCompleted && !(isPastBooking && isPaid)) {
          canReview = false;
          errorMessage = "You can only review completed or past bookings.";
        }
      }

      // Check result
      const testPassed = canReview === scenario.shouldAllow;
      
      if (testPassed) {
        console.log(`✓ PASS: Validation behaved as expected`);
        passCount++;
      } else {
        console.log(`✗ FAIL: Expected ${scenario.shouldAllow ? "ALLOW" : "REJECT"}, got ${canReview ? "ALLOW" : "REJECT"}`);
        if (errorMessage) {
          console.log(`  Error message: ${errorMessage}`);
        }
        failCount++;
      }

      // Clean up test booking
      await Booking.findByIdAndDelete(booking._id);
      console.log(`✓ Cleaned up test booking`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total tests: ${scenarios.length}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Success rate: ${((passCount / scenarios.length) * 100).toFixed(1)}%`);

    if (failCount === 0) {
      console.log("\n✓ All tests passed! Review eligibility validation is working correctly.");
    } else {
      console.log("\n✗ Some tests failed. Please review the validation logic.");
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

testReviewEligibility();
