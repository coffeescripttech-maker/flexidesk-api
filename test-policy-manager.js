/**
 * Test script for PolicyManager service
 * Run with: node test-policy-manager.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PolicyManager = require('./src/services/PolicyManager');
const Listing = require('./src/models/Listing');

async function testPolicyManager() {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to database\n');

    // Test 1: Get policy templates
    console.log('Test 1: Get Policy Templates');
    console.log('================================');
    const templates = PolicyManager.getPolicyTemplates();
    console.log('Available templates:', Object.keys(templates));
    console.log('Flexible template:', JSON.stringify(templates.flexible, null, 2));
    console.log('✓ Test 1 passed\n');

    // Test 2: Validate valid policy
    console.log('Test 2: Validate Valid Policy');
    console.log('================================');
    const validPolicy = {
      type: 'custom',
      allowCancellation: true,
      automaticRefund: true,
      tiers: [
        { hoursBeforeBooking: 168, refundPercentage: 100, description: 'Full refund' },
        { hoursBeforeBooking: 48, refundPercentage: 50, description: 'Half refund' },
        { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund' }
      ],
      processingFeePercentage: 5
    };
    const validation1 = PolicyManager.validatePolicy(validPolicy);
    console.log('Validation result:', validation1);
    if (!validation1.valid) {
      throw new Error('Valid policy failed validation');
    }
    console.log('✓ Test 2 passed\n');

    // Test 3: Validate invalid policy (duplicate tiers)
    console.log('Test 3: Validate Invalid Policy (Duplicate Tiers)');
    console.log('====================================================');
    const invalidPolicy1 = {
      type: 'custom',
      allowCancellation: true,
      tiers: [
        { hoursBeforeBooking: 48, refundPercentage: 100, description: 'Full refund' },
        { hoursBeforeBooking: 48, refundPercentage: 50, description: 'Half refund' }
      ],
      processingFeePercentage: 5
    };
    const validation2 = PolicyManager.validatePolicy(invalidPolicy1);
    console.log('Validation result:', validation2);
    if (validation2.valid) {
      throw new Error('Invalid policy passed validation');
    }
    console.log('✓ Test 3 passed\n');

    // Test 4: Validate invalid policy (refund percentage out of range)
    console.log('Test 4: Validate Invalid Policy (Refund % Out of Range)');
    console.log('==========================================================');
    const invalidPolicy2 = {
      type: 'custom',
      allowCancellation: true,
      tiers: [
        { hoursBeforeBooking: 48, refundPercentage: 150, description: 'Invalid refund' }
      ],
      processingFeePercentage: 5
    };
    const validation3 = PolicyManager.validatePolicy(invalidPolicy2);
    console.log('Validation result:', validation3);
    if (validation3.valid) {
      throw new Error('Invalid policy passed validation');
    }
    console.log('✓ Test 4 passed\n');

    // Test 5: Validate invalid policy (tier ordering issue)
    console.log('Test 5: Validate Invalid Policy (Tier Ordering)');
    console.log('==================================================');
    const invalidPolicy3 = {
      type: 'custom',
      allowCancellation: true,
      tiers: [
        { hoursBeforeBooking: 168, refundPercentage: 50, description: 'Half refund' },
        { hoursBeforeBooking: 48, refundPercentage: 100, description: 'Full refund' }
      ],
      processingFeePercentage: 5
    };
    const validation4 = PolicyManager.validatePolicy(invalidPolicy3);
    console.log('Validation result:', validation4);
    if (validation4.valid) {
      throw new Error('Invalid policy passed validation');
    }
    console.log('✓ Test 5 passed\n');

    // Test 6: Set and get policy for a listing
    console.log('Test 6: Set and Get Policy');
    console.log('============================');
    
    // Find or create a test listing
    let testListing = await Listing.findOne({ status: 'active' });
    if (!testListing) {
      console.log('No active listing found, skipping set/get test');
    } else {
      console.log('Using listing:', testListing._id);
      
      // Set a flexible policy
      const setResult = await PolicyManager.setPolicy(testListing._id, templates.flexible);
      console.log('Policy set successfully:', setResult.type);
      
      // Get the policy back
      const getResult = await PolicyManager.getPolicy(testListing._id);
      console.log('Policy retrieved:', getResult.type);
      
      if (getResult.type !== 'flexible') {
        throw new Error('Retrieved policy does not match set policy');
      }
      console.log('✓ Test 6 passed\n');
    }

    console.log('========================================');
    console.log('All tests passed! ✓');
    console.log('========================================');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run tests
testPolicyManager();
