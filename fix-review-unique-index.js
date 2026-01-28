// fix-review-unique-index.js
// This script removes the incorrect unique index on bookingId
// and ensures the correct compound unique index exists

require("dotenv").config();
const mongoose = require("mongoose");

async function fixReviewIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("reviews");

    // Get all existing indexes
    const indexes = await collection.indexes();
    console.log("\n📋 Current indexes:");
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
      if (idx.unique) console.log(`    (unique: true)`);
    });

    // Drop the incorrect unique index on bookingId if it exists
    try {
      await collection.dropIndex("bookingId_1");
      console.log("\n✓ Dropped incorrect unique index on bookingId");
    } catch (err) {
      if (err.code === 27 || err.codeName === "IndexNotFound") {
        console.log("\n✓ Index bookingId_1 doesn't exist (already removed)");
      } else {
        console.log("\n⚠ Could not drop bookingId_1 index:", err.message);
      }
    }

    // Ensure the correct compound unique index exists
    try {
      await collection.createIndex(
        { userId: 1, bookingId: 1 },
        { unique: true, name: "userId_1_bookingId_1" }
      );
      console.log("✓ Ensured compound unique index (userId + bookingId) exists");
    } catch (err) {
      if (err.code === 85 || err.codeName === "IndexOptionsConflict") {
        console.log("✓ Compound unique index already exists");
      } else {
        console.log("⚠ Could not create compound index:", err.message);
      }
    }

    // Show final indexes
    const finalIndexes = await collection.indexes();
    console.log("\n📋 Final indexes:");
    finalIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
      if (idx.unique) console.log(`    (unique: true)`);
    });

    console.log("\n✅ Index fix complete!");
    console.log("\n📝 Summary:");
    console.log("  - Removed: unique index on bookingId alone");
    console.log("  - Kept: compound unique index on (userId + bookingId)");
    console.log("  - Result: Users can now review different bookings of the same listing");
    console.log("  - Protection: Each user can still only review each booking once");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

fixReviewIndexes();
