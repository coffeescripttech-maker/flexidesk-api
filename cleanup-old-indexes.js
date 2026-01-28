// cleanup-old-indexes.js
// Remove old indexes with incorrect field names (user, listing, booking)
// Keep only new indexes with correct field names (userId, listingId, bookingId)

require("dotenv").config();
const mongoose = require("mongoose");

async function cleanupIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB\n");

    const db = mongoose.connection.db;
    const collection = db.collection("reviews");

    // List of old indexes to drop (using old field names)
    const oldIndexesToDrop = [
      "user_1",
      "listing_1",
      "booking_1",
      "user_1_booking_1",  // This is the problematic one!
      "listing_1_status_1_createdAt_-1",
      "user_1_createdAt_-1",
      "status_1_flaggedAt_-1",
    ];

    console.log("🗑️  Dropping old indexes with incorrect field names...\n");

    for (const indexName of oldIndexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✓ Dropped: ${indexName}`);
      } catch (err) {
        if (err.code === 27 || err.codeName === "IndexNotFound") {
          console.log(`  (${indexName} doesn't exist - skipped)`);
        } else {
          console.log(`  ⚠️  Error dropping ${indexName}:`, err.message);
        }
      }
    }

    console.log("\n📋 Remaining indexes:");
    const remainingIndexes = await collection.indexes();
    remainingIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      if (idx.unique) console.log(`    (unique: true)`);
    });

    console.log("\n✅ Cleanup complete!");
    console.log("\n📝 Summary:");
    console.log("  - Removed old indexes using 'user', 'listing', 'booking' fields");
    console.log("  - Kept new indexes using 'userId', 'listingId', 'bookingId' fields");
    console.log("  - The compound unique index (userId + bookingId) is now the only duplicate prevention");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB\n");
  }
}

cleanupIndexes();
