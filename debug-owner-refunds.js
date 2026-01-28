// debug-owner-refunds.js
// Debug script to check owner ID matching

const mongoose = require("mongoose");
require("dotenv").config();

const CancellationRequest = require("./src/models/CancellationRequest");
const User = require("./src/models/User");

async function debugOwnerRefunds() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get all owners
    console.log("👥 Finding all owners...");
    const owners = await User.find({ role: "owner" }).lean();
    console.log(`   Found ${owners.length} owners\n`);

    owners.forEach((owner, idx) => {
      console.log(`${idx + 1}. Owner: ${owner.fullName || owner.email}`);
      console.log(`   ID: ${owner._id}`);
      console.log(`   Email: ${owner.email}\n`);
    });

    // Get all cancellation requests
    console.log("📋 Finding all cancellation requests...");
    const requests = await CancellationRequest.find().lean();
    console.log(`   Found ${requests.length} requests\n`);

    requests.forEach((req, idx) => {
      console.log(`${idx + 1}. Request ID: ${req._id}`);
      console.log(`   Owner ID: ${req.ownerId}`);
      console.log(`   Client ID: ${req.clientId}`);
      console.log(`   Listing ID: ${req.listingId}`);
      console.log(`   Status: ${req.status}`);
      console.log(`   Refund: PHP ${req.refundCalculation?.finalRefund || 0}\n`);
    });

    // Check if owner IDs match
    console.log("🔍 Checking owner ID matches...");
    for (const owner of owners) {
      const ownerRequests = await CancellationRequest.find({ 
        ownerId: owner._id 
      }).lean();
      console.log(`   Owner ${owner.fullName || owner.email}: ${ownerRequests.length} requests`);
    }

    console.log("\n✅ Debug complete!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the debug
debugOwnerRefunds();
