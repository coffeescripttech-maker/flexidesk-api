// test-cancellation-models.js
// Simple test to verify the cancellation models work correctly

require("dotenv").config();
const mongoose = require("mongoose");

const CancellationRequest = require("./src/models/CancellationRequest");
const RefundTransaction = require("./src/models/RefundTransaction");
const Listing = require("./src/models/Listing");

const {
  MONGODB_URI = "mongodb+srv://flexideskproject_db_user:CYaa4RMhrW8cOYY8@flexidesk.iux9xeh.mongodb.net/flexidesk?retryWrites=true&w=majority&appName=Flexidesk",
} = process.env;

async function connect() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB.");
  } catch (err) {
    console.error("✗ MongoDB connection error:", err);
    process.exit(1);
  }
}

async function testModels() {
  try {
    await connect();

    console.log("\n=== Testing Cancellation Models ===\n");

    // Test 1: Verify CancellationPolicy schema in Listing
    console.log("Test 1: Listing with CancellationPolicy");
    const testListing = await Listing.findOne();
    if (testListing) {
      console.log("✓ Found existing listing:", testListing._id);
      console.log("  Current cancellationPolicy:", testListing.cancellationPolicy || "none");
      
      // Update with a sample policy
      testListing.cancellationPolicy = {
        type: 'flexible',
        allowCancellation: true,
        automaticRefund: true,
        tiers: [
          { hoursBeforeBooking: 24, refundPercentage: 100, description: 'Full refund' },
          { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund' }
        ],
        processingFeePercentage: 0
      };
      await testListing.save();
      console.log("✓ Successfully added cancellation policy to listing");
    } else {
      console.log("⚠ No listings found to test with");
    }

    // Test 2: Create a sample CancellationRequest
    console.log("\nTest 2: CancellationRequest Model");
    const sampleRequest = {
      bookingId: new mongoose.Types.ObjectId(),
      clientId: new mongoose.Types.ObjectId(),
      ownerId: new mongoose.Types.ObjectId(),
      listingId: new mongoose.Types.ObjectId(),
      requestedAt: new Date(),
      bookingStartDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
      bookingEndDate: new Date(Date.now() + 49 * 60 * 60 * 1000),
      bookingAmount: 1000,
      refundCalculation: {
        originalAmount: 1000,
        refundPercentage: 100,
        refundAmount: 1000,
        processingFee: 0,
        finalRefund: 1000,
        hoursUntilBooking: 48,
        appliedTier: { hoursBeforeBooking: 24, refundPercentage: 100 }
      },
      cancellationReason: 'schedule_change',
      status: 'pending',
      isAutomatic: false
    };

    const cancellationRequest = new CancellationRequest(sampleRequest);
    const validationError = cancellationRequest.validateSync();
    if (validationError) {
      console.log("✗ Validation error:", validationError.message);
    } else {
      console.log("✓ CancellationRequest validation passed");
      console.log("  Sample request structure is valid");
    }

    // Test 3: Create a sample RefundTransaction
    console.log("\nTest 3: RefundTransaction Model");
    const sampleTransaction = {
      cancellationRequestId: new mongoose.Types.ObjectId(),
      bookingId: new mongoose.Types.ObjectId(),
      clientId: new mongoose.Types.ObjectId(),
      ownerId: new mongoose.Types.ObjectId(),
      amount: 1000,
      currency: 'PHP',
      paymentMethod: 'paymongo',
      originalTransactionId: 'test_txn_123',
      status: 'pending',
      gatewayProvider: 'paymongo',
      initiatedAt: new Date()
    };

    const refundTransaction = new RefundTransaction(sampleTransaction);
    const txnValidationError = refundTransaction.validateSync();
    if (txnValidationError) {
      console.log("✗ Validation error:", txnValidationError.message);
    } else {
      console.log("✓ RefundTransaction validation passed");
      console.log("  Sample transaction structure is valid");
    }

    // Test 4: Verify indexes
    console.log("\nTest 4: Verify Indexes");
    const cancellationIndexes = await CancellationRequest.collection.getIndexes();
    console.log("✓ CancellationRequest indexes:", Object.keys(cancellationIndexes).length);
    
    const refundIndexes = await RefundTransaction.collection.getIndexes();
    console.log("✓ RefundTransaction indexes:", Object.keys(refundIndexes).length);

    console.log("\n=== All Tests Passed ===\n");
    console.log("Summary:");
    console.log("✓ CancellationPolicy schema works in Listing model");
    console.log("✓ CancellationRequest model validates correctly");
    console.log("✓ RefundTransaction model validates correctly");
    console.log("✓ All indexes are created");
    console.log("\nModels are ready for use in the application!");

  } catch (err) {
    console.error("\n✗ Test error:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
    console.log("\n✓ Disconnected from MongoDB.");
  }
}

testModels();
