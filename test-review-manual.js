// test-review-manual.js
// Manual test to verify review eligibility by creating test bookings

const mongoose = require("mongoose");
require("dotenv").config();

const Booking = require("./src/models/Booking");
const User = require("./src/models/User");
const Listing = require("./src/models/Listing");

async function createTestBookings() {
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

    console.log("=".repeat(80));
    console.log("CREATING TEST BOOKINGS FOR MANUAL REVIEW TESTING");
    console.log("=".repeat(80) + "\n");

    // Create test bookings
    const testBookings = [
      {
        name: "Past paid booking (SHOULD ALLOW REVIEW)",
        data: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "paid",
        },
      },
      {
        name: "Completed booking (SHOULD ALLOW REVIEW)",
        data: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "completed",
        },
      },
      {
        name: "Cancelled booking (SHOULD REJECT REVIEW)",
        data: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "cancelled",
        },
      },
      {
        name: "Future paid booking (SHOULD REJECT REVIEW)",
        data: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "paid",
        },
      },
      {
        name: "Pending payment booking (SHOULD REJECT REVIEW)",
        data: {
          userId: user._id,
          listingId: listing._id,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          nights: 1,
          guests: 1,
          amount: 1000,
          status: "pending_payment",
        },
      },
    ];

    const createdBookings = [];

    for (const test of testBookings) {
      console.log(`\nCreating: ${test.name}`);
      const booking = await Booking.create(test.data);
      createdBookings.push({ ...test, booking });
      console.log(`✓ Created booking ID: ${booking._id}`);
      console.log(`  Status: ${booking.status}`);
      console.log(`  Start Date: ${booking.startDate}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("TEST BOOKINGS CREATED SUCCESSFULLY");
    console.log("=".repeat(80));
    console.log("\nYou can now test the review functionality manually:");
    console.log("1. Start the API server: npm start");
    console.log("2. Login to the frontend with the test user");
    console.log("3. Navigate to 'My Bookings' page");
    console.log("4. Try to review each booking and verify the behavior\n");

    console.log("Booking IDs for testing:");
    createdBookings.forEach(({ name, booking }) => {
      console.log(`  ${name}`);
      console.log(`    ID: ${booking._id}`);
      console.log(`    API endpoint: POST /reviews/booking/${booking._id}`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("CLEANUP INSTRUCTIONS");
    console.log("=".repeat(80));
    console.log("\nTo clean up these test bookings, run:");
    console.log("node test-review-cleanup.js\n");

    // Save booking IDs to a file for cleanup
    const fs = require('fs');
    const bookingIds = createdBookings.map(b => b.booking._id.toString());
    fs.writeFileSync(
      'test-review-bookings.json',
      JSON.stringify({ bookingIds, createdAt: new Date().toISOString() }, null, 2)
    );
    console.log("✓ Saved booking IDs to test-review-bookings.json for cleanup\n");

  } catch (error) {
    console.error("✗ Error during test setup:", error.message);
    console.error(error);
  } finally {
    clearTimeout(timeout);
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
    process.exit(0);
  }
}

createTestBookings();
