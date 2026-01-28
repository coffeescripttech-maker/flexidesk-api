// verify-indexes.js
// Check current indexes on reviews collection

require("dotenv").config();
const mongoose = require("mongoose");

async function verifyIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("reviews");

    const indexes = await collection.indexes();
    
    console.log("\n📋 All indexes on 'reviews' collection:");
    console.log("=".repeat(60));
    
    indexes.forEach((idx, i) => {
      console.log(`\n${i + 1}. Index: ${idx.name}`);
      console.log(`   Keys: ${JSON.stringify(idx.key)}`);
      if (idx.unique) {
        console.log(`   ⚠️  UNIQUE: true`);
      }
      if (idx.sparse) {
        console.log(`   Sparse: true`);
      }
    });

    console.log("\n" + "=".repeat(60));
    
    // Check specifically for bookingId index
    const bookingIdIndex = indexes.find(idx => idx.name === "bookingId_1");
    if (bookingIdIndex) {
      console.log("\n❌ PROBLEM: bookingId_1 index still exists!");
      console.log("   This index should have been dropped.");
      if (bookingIdIndex.unique) {
        console.log("   It has unique: true - this is causing the error!");
      }
    } else {
      console.log("\n✓ Good: bookingId_1 index has been removed");
    }

    // Check for compound index
    const compoundIndex = indexes.find(idx => 
      idx.name === "userId_1_bookingId_1" || 
      (idx.key.userId === 1 && idx.key.bookingId === 1)
    );
    
    if (compoundIndex) {
      console.log("✓ Good: Compound index (userId + bookingId) exists");
      if (compoundIndex.unique) {
        console.log("  ✓ It has unique: true (correct)");
      }
    } else {
      console.log("❌ PROBLEM: Compound index (userId + bookingId) not found!");
    }

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB\n");
  }
}

verifyIndexes();
