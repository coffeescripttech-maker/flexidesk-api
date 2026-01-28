// migrations/add-cancellation-models.js
// This script ensures indexes are created for the new cancellation and refund models

require("dotenv").config();
const mongoose = require("mongoose");

// Import the new models
const CancellationRequest = require("../src/models/CancellationRequest");
const RefundTransaction = require("../src/models/RefundTransaction");
const Listing = require("../src/models/Listing");

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

async function runMigration() {
  try {
    await connect();

    console.log("\n=== Running Cancellation & Refund Models Migration ===\n");

    // Ensure indexes are created for all models
    console.log("Creating indexes for CancellationRequest model...");
    await CancellationRequest.init();
    await CancellationRequest.createIndexes();
    console.log("✓ CancellationRequest indexes created");

    console.log("\nCreating indexes for RefundTransaction model...");
    await RefundTransaction.init();
    await RefundTransaction.createIndexes();
    console.log("✓ RefundTransaction indexes created");

    console.log("\nUpdating Listing model with cancellationPolicy field...");
    await Listing.init();
    await Listing.createIndexes();
    console.log("✓ Listing model updated");

    // Verify the models are working
    console.log("\n=== Verifying Models ===\n");

    const cancellationCount = await CancellationRequest.countDocuments();
    console.log(`✓ CancellationRequest collection: ${cancellationCount} documents`);

    const refundCount = await RefundTransaction.countDocuments();
    console.log(`✓ RefundTransaction collection: ${refundCount} documents`);

    const listingCount = await Listing.countDocuments();
    console.log(`✓ Listing collection: ${listingCount} documents`);

    console.log("\n=== Migration Completed Successfully ===\n");
    console.log("Summary:");
    console.log("- Added CancellationPolicy schema to Listing model");
    console.log("- Created CancellationRequest model with indexes");
    console.log("- Created RefundTransaction model with indexes");
    console.log("\nAll indexes have been created and models are ready to use.");

  } catch (err) {
    console.error("\n✗ Migration error:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
    console.log("\n✓ Disconnected from MongoDB.");
  }
}

runMigration();
