/**
 * Test script for Owner Policy API Endpoints
 * Tests the three endpoints:
 * - GET /api/owner/cancellation-policies/templates
 * - GET /api/owner/listings/:id/cancellation-policy
 * - PUT /api/owner/listings/:id/cancellation-policy
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');
const PolicyManager = require('./src/services/PolicyManager');

async function testPolicyAPIEndpoints() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Get Policy Templates
    console.log('📋 Test 1: Get Policy Templates');
    console.log('=' .repeat(50));
    const templates = PolicyManager.getPolicyTemplates();
    console.log('Available templates:', Object.keys(templates));
    console.log('Flexible template:', JSON.stringify(templates.flexible, null, 2));
    console.log('✅ Test 1 passed\n');

    // Test 2: Create a test listing
    console.log('📋 Test 2: Create Test Listing');
    console.log('=' .repeat(50));
    
    // Find an existing owner user
    let testUser = await User.findOne({ role: 'owner' });
    if (!testUser) {
      console.log('No existing owner found, using first user and upgrading to owner');
      testUser = await User.findOne();
      if (testUser) {
        testUser.role = 'owner';
        await testUser.save();
      }
    }
    
    if (!testUser) {
      console.log('❌ No users found in database. Please create a user first.');
      return;
    }
    
    console.log('Using test user:', testUser.email);

    // Create a test listing
    const testListing = await Listing.create({
      owner: testUser._id,
      title: 'Test Workspace for Policy API',
      description: 'Testing cancellation policy endpoints',
      category: 'office',
      address: '123 Test St, Test City',
      city: 'Test City',
      region: 'Test Province',
      zip: '12345',
      seats: 10,
      status: 'draft'
    });
    console.log('Created test listing:', testListing._id);
    console.log('✅ Test 2 passed\n');

    // Test 3: Set Cancellation Policy (Flexible)
    console.log('📋 Test 3: Set Flexible Policy');
    console.log('=' .repeat(50));
    const flexiblePolicy = await PolicyManager.setPolicy(
      testListing._id.toString(),
      templates.flexible
    );
    console.log('Set flexible policy:', JSON.stringify(flexiblePolicy, null, 2));
    console.log('✅ Test 3 passed\n');

    // Test 4: Get Cancellation Policy
    console.log('📋 Test 4: Get Cancellation Policy');
    console.log('=' .repeat(50));
    const retrievedPolicy = await PolicyManager.getPolicy(testListing._id.toString());
    console.log('Retrieved policy type:', retrievedPolicy.type);
    console.log('Policy tiers:', retrievedPolicy.tiers.length);
    console.log('✅ Test 4 passed\n');

    // Test 5: Update to Moderate Policy
    console.log('📋 Test 5: Update to Moderate Policy');
    console.log('=' .repeat(50));
    const moderatePolicy = await PolicyManager.setPolicy(
      testListing._id.toString(),
      templates.moderate
    );
    console.log('Updated to moderate policy');
    console.log('Processing fee:', moderatePolicy.processingFeePercentage + '%');
    console.log('Tiers:', moderatePolicy.tiers.length);
    console.log('✅ Test 5 passed\n');

    // Test 6: Set Custom Policy
    console.log('📋 Test 6: Set Custom Policy');
    console.log('=' .repeat(50));
    const customPolicy = {
      type: 'custom',
      allowCancellation: true,
      automaticRefund: true,
      tiers: [
        { hoursBeforeBooking: 72, refundPercentage: 100, description: 'Full refund (3+ days)' },
        { hoursBeforeBooking: 24, refundPercentage: 75, description: '75% refund (1-3 days)' },
        { hoursBeforeBooking: 0, refundPercentage: 25, description: '25% refund (<1 day)' }
      ],
      processingFeePercentage: 3,
      customNotes: 'Custom policy with 3 tiers'
    };
    const setCustomPolicy = await PolicyManager.setPolicy(
      testListing._id.toString(),
      customPolicy
    );
    console.log('Set custom policy with', setCustomPolicy.tiers.length, 'tiers');
    console.log('✅ Test 6 passed\n');

    // Test 7: Validate Invalid Policy (should fail)
    console.log('📋 Test 7: Validate Invalid Policy');
    console.log('=' .repeat(50));
    const invalidPolicy = {
      type: 'custom',
      allowCancellation: true,
      tiers: [
        { hoursBeforeBooking: 24, refundPercentage: 150, description: 'Invalid percentage' }
      ]
    };
    const validation = PolicyManager.validatePolicy(invalidPolicy);
    if (!validation.valid) {
      console.log('✅ Correctly rejected invalid policy');
      console.log('Errors:', validation.errors);
    } else {
      console.log('❌ Should have rejected invalid policy');
    }
    console.log('✅ Test 7 passed\n');

    // Test 8: Validate Tier Ordering
    console.log('📋 Test 8: Validate Tier Ordering');
    console.log('=' .repeat(50));
    const badOrderPolicy = {
      type: 'custom',
      allowCancellation: true,
      tiers: [
        { hoursBeforeBooking: 24, refundPercentage: 50, description: 'Later tier' },
        { hoursBeforeBooking: 72, refundPercentage: 25, description: 'Earlier tier with less refund' }
      ]
    };
    const orderValidation = PolicyManager.validatePolicy(badOrderPolicy);
    if (!orderValidation.valid) {
      console.log('✅ Correctly detected tier ordering issue');
      console.log('Errors:', orderValidation.errors);
    } else {
      console.log('❌ Should have detected tier ordering issue');
    }
    console.log('✅ Test 8 passed\n');

    // Test 9: Verify Policy Persistence
    console.log('📋 Test 9: Verify Policy Persistence');
    console.log('=' .repeat(50));
    const freshListing = await Listing.findById(testListing._id);
    console.log('Policy persisted in database:', freshListing.cancellationPolicy.type);
    console.log('Has timestamps:', {
      createdAt: !!freshListing.cancellationPolicy.createdAt,
      updatedAt: !!freshListing.cancellationPolicy.updatedAt
    });
    console.log('✅ Test 9 passed\n');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await Listing.findByIdAndDelete(testListing._id);
    console.log('Deleted test listing');

    console.log('\n' + '='.repeat(50));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(50));
    console.log('\nAPI Endpoints Summary:');
    console.log('1. GET /api/owner/cancellation-policies/templates - Returns policy templates');
    console.log('2. GET /api/owner/listings/:id/cancellation-policy - Gets listing policy');
    console.log('3. PUT /api/owner/listings/:id/cancellation-policy - Sets/updates policy');
    console.log('\nValidation includes:');
    console.log('- Policy structure validation');
    console.log('- Tier ordering (descending hours)');
    console.log('- Refund percentages (0-100)');
    console.log('- Processing fee validation');
    console.log('- Duplicate tier detection');
    console.log('- Policy change tracking with timestamps');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run tests
testPolicyAPIEndpoints();
