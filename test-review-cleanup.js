// test-review-cleanup.js
// Clean up test bookings created by test-review-manual.js

const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config();

const Booking = require("./src/models/Booking");
const Review = require("./src/models/Review");

async function cleanupTestBookings() {
  const timeout = setTimeout(() => {
    console.log("\n✗ Cleanup timed out after 30 seconds");
    process.exit(1);
  }, 30000);

  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Read booking IDs from file
    if (!fs.existsSync('test-review-bookings.json')) {
      console.log("✗ No test-review-bookings.json file found.");
      console.log("  Nothing to clean up.");
      return;
    }

    const data = JSON.parse(fs.readFileSync('test-review-bookings.json', 'utf8'));
    const bookingIds = data.bookingIds || [];

    if (!bookingIds.length) {
      console.log("✗ No booking IDs found in test-review-bookings.json");
      return;
    }

    console.log(`Found ${bookingIds.length} test bookings to clean up\n`);

    // Delete reviews for these bookings
    const reviewsDeleted = await Review.deleteMany({ booking: { $in: bookingIds } });
    console.log(`✓ Deleted ${reviewsDeleted.deletedCount} reviews`);

    // Delete bookings
    const bookingsDeleted = await Booking.deleteMany({ _id: { $in: bookingIds } });
    console.log(`✓ Deleted ${bookingsDeleted.deletedCount} bookings`);

    // Delete the tracking file
    fs.unlinkSync('test-review-bookings.json');
    console.log("✓ Deleted test-review-bookings.json\n");

    console.log("✓ Cleanup completed successfully!");

  } catch (error) {
    console.error("✗ Error during cleanup:", error.message);
    console.error(error);
  } finally {
    clearTimeout(timeout);
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
    process.exit(0);
  }
}

cleanupTestBookings();
