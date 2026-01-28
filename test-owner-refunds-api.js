// test-owner-refunds-api.js
// Test script for owner refunds API endpoints

const mongoose = require("mongoose");
require("dotenv").config();

const CancellationRequest = require("./src/models/CancellationRequest");
const Booking = require("./src/models/Booking");
const Listing = require("./src/models/Listing");
const User = require("./src/models/User");

async function testOwnerRefundsAPI() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Check if CancellationRequest collection exists
    console.log("📊 Checking CancellationRequest collection...");
    const count = await CancellationRequest.countDocuments();
    console.log(`   Found ${count} cancellation requests\n`);

    if (count === 0) {
      console.log("ℹ️  No cancellation requests found. This is why you see 'No refund requests to display.'\n");
      
      // Check if we have the necessary data to create a test request
      console.log("🔍 Checking for test data...");
      const owner = await User.findOne({ role: "owner" });
      const client = await User.findOne({ role: "client" });
      const listing = await Listing.findOne({ ownerId: owner?._id });
      const booking = await Booking.findOne({ 
        listingId: listing?._id,
        status: { $in: ["confirmed", "pending"] }
      });

      console.log(`   Owner found: ${owner ? "✅" : "❌"}`);
      console.log(`   Client found: ${client ? "✅" : "❌"}`);
      console.log(`   Listing found: ${listing ? "✅" : "❌"}`);
      console.log(`   Booking found: ${booking ? "✅" : "❌"}\n`);

      if (owner && client && listing && booking) {
        console.log("💡 Would you like to create a test cancellation request?");
        console.log("   Run this script with --create flag to create test data\n");
        
        if (process.argv.includes("--create")) {
          console.log("📝 Creating test cancellation request...");
          
          const testRequest = await CancellationRequest.create({
            bookingId: booking._id,
            clientId: client._id,
            ownerId: owner._id,
            listingId: listing._id,
            requestedAt: new Date(),
            bookingStartDate: booking.checkInDate || booking.startDate,
            bookingEndDate: booking.checkOutDate || booking.endDate,
            bookingAmount: booking.totalAmount || booking.amount || 1000,
            refundCalculation: {
              originalAmount: booking.totalAmount || booking.amount || 1000,
              refundPercentage: 100,
              refundAmount: booking.totalAmount || booking.amount || 1000,
              processingFee: 0,
              finalRefund: booking.totalAmount || booking.amount || 1000,
              hoursUntilBooking: 48,
              appliedTier: {
                hoursBeforeBooking: 24,
                refundPercentage: 100,
                description: "Full refund"
              }
            },
            cancellationReason: "schedule_change",
            status: "pending",
            isAutomatic: false
          });

          console.log("✅ Test cancellation request created!");
          console.log(`   ID: ${testRequest._id}`);
          console.log(`   Status: ${testRequest.status}`);
          console.log(`   Refund Amount: PHP ${testRequest.refundCalculation.finalRefund}\n`);
          console.log("🎉 Now refresh your refunds page to see the test request!\n");
        }
      } else {
        console.log("⚠️  Missing required data to create test cancellation request");
        console.log("   You need: owner, client, listing, and booking\n");
      }
    } else {
      console.log("📋 Listing cancellation requests:\n");
      const requests = await CancellationRequest.find()
        .populate("clientId", "fullName email")
        .populate("ownerId", "fullName email")
        .populate("listingId", "shortDesc title")
        .populate("bookingId", "code shortId")
        .limit(10)
        .lean();

      requests.forEach((req, idx) => {
        console.log(`${idx + 1}. Request ID: ${req._id}`);
        console.log(`   Client: ${req.clientId?.fullName || "Unknown"}`);
        console.log(`   Owner: ${req.ownerId?.fullName || "Unknown"}`);
        console.log(`   Listing: ${req.listingId?.shortDesc || req.listingId?.title || "Unknown"}`);
        console.log(`   Status: ${req.status}`);
        console.log(`   Refund: PHP ${req.refundCalculation?.finalRefund || 0}`);
        console.log(`   Requested: ${req.requestedAt?.toLocaleDateString()}`);
        console.log("");
      });
    }

    // Test API endpoint structure
    console.log("📡 API Endpoint Information:");
    console.log("   GET  /api/owner/refunds - List all refund requests");
    console.log("   GET  /api/owner/refunds/stats - Get statistics");
    console.log("   GET  /api/owner/refunds/:id - Get single request");
    console.log("   POST /api/owner/refunds/:id/approve - Approve request");
    console.log("   POST /api/owner/refunds/:id/reject - Reject request\n");

    console.log("✅ Test complete!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the test
testOwnerRefundsAPI();
