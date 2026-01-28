// Test script to check booking overlap detection
require("dotenv").config();
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/flexidesk";

const bookingSchema = new mongoose.Schema({}, { strict: false, collection: "bookings" });
const Booking = mongoose.model("Booking", bookingSchema);

async function testOverlap() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    const listingId = "69723fafc632e19b7ccde130";

    // Find all bookings for this listing
    const bookings = await Booking.find({
      listingId,
      status: { $ne: "cancelled" }
    })
      .select("_id startDate endDate checkInTime checkOutTime status guests createdAt")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📋 Found ${bookings.length} active bookings for listing ${listingId}:\n`);

    bookings.forEach((b, idx) => {
      console.log(`Booking ${idx + 1}:`);
      console.log(`  ID: ${b._id}`);
      console.log(`  Dates: ${b.startDate} to ${b.endDate}`);
      console.log(`  Times: ${b.checkInTime || 'N/A'} - ${b.checkOutTime || 'N/A'}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Guests: ${b.guests || 1}`);
      console.log(`  Created: ${b.createdAt}`);
      console.log('');
    });

    // Test case: Check if 2026-01-29 08:44 - 2026-01-30 10:45 should conflict
    console.log('🧪 Test Case:');
    console.log('  Request: 2026-01-29 08:44 - 2026-01-30 10:45');
    console.log('  Expected: Should conflict with existing booking\n');

    // Check date overlap
    const testStart = "2026-01-29";
    const testEnd = "2026-01-30";

    const dateOverlap = bookings.filter(b => {
      return b.startDate <= testEnd && b.endDate >= testStart;
    });

    console.log(`📅 Bookings with date overlap: ${dateOverlap.length}`);
    dateOverlap.forEach(b => {
      console.log(`  - ${b._id}: ${b.startDate} to ${b.endDate}, ${b.checkInTime}-${b.checkOutTime}`);
    });

    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testOverlap();
