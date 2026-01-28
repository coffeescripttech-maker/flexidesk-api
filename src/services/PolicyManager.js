/**
 * PolicyManager Service
 * Manages cancellation policies for workspaces
 */

const Listing = require('../models/Listing');

// Policy Templates (defined in subtask 2.2)
const POLICY_TEMPLATES = {
  flexible: {
    type: 'flexible',
    allowCancellation: true,
    automaticRefund: true,
    tiers: [
      { hoursBeforeBooking: 24, refundPercentage: 100, description: 'Full refund if cancelled 24+ hours before' },
      { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund if cancelled less than 24 hours before' }
    ],
    processingFeePercentage: 0,
    customNotes: 'Flexible cancellation policy - Full refund with 24 hours notice'
  },
  moderate: {
    type: 'moderate',
    allowCancellation: true,
    automaticRefund: true,
    tiers: [
      { hoursBeforeBooking: 168, refundPercentage: 100, description: 'Full refund if cancelled 7+ days before' },
      { hoursBeforeBooking: 48, refundPercentage: 50, description: '50% refund if cancelled 2-7 days before' },
      { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund if cancelled less than 2 days before' }
    ],
    processingFeePercentage: 5,
    customNotes: 'Moderate cancellation policy - Full refund with 7 days notice, 50% with 2 days notice'
  },
  strict: {
    type: 'strict',
    allowCancellation: true,
    automaticRefund: false,
    tiers: [
      { hoursBeforeBooking: 336, refundPercentage: 50, description: '50% refund if cancelled 14+ days before' },
      { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund if cancelled less than 14 days before' }
    ],
    processingFeePercentage: 10,
    customNotes: 'Strict cancellation policy - 50% refund only with 14 days notice'
  },
  none: {
    type: 'none',
    allowCancellation: false,
    automaticRefund: false,
    tiers: [],
    processingFeePercentage: 0,
    customNotes: 'No cancellations allowed'
  }
};

class PolicyManager {
  /**
   * Create or update cancellation policy for a workspace
   * @param {string} listingId - Workspace ID
   * @param {Object} policyData - Policy configuration
   * @returns {Promise<Object>} Created/updated policy
   */
  async setPolicy(listingId, policyData) {
    // Validate the policy
    const validation = this.validatePolicy(policyData);
    if (!validation.valid) {
      throw new Error(`Invalid policy: ${validation.errors.join(', ')}`);
    }

    // Update the listing with the new policy
    const listing = await Listing.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Set timestamps
    const now = new Date();
    const policy = {
      ...policyData,
      updatedAt: now,
      createdAt: listing.cancellationPolicy?.createdAt || now
    };

    listing.cancellationPolicy = policy;
    await listing.save();

    return listing.cancellationPolicy;
  }

  /**
   * Get cancellation policy for a workspace
   * @param {string} listingId - Workspace ID
   * @returns {Promise<Object>} Policy details
   */
  async getPolicy(listingId) {
    const listing = await Listing.findById(listingId).select('cancellationPolicy');
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Return default moderate policy if none set
    if (!listing.cancellationPolicy || !listing.cancellationPolicy.type) {
      return POLICY_TEMPLATES.moderate;
    }

    return listing.cancellationPolicy;
  }

  /**
   * Validate policy configuration
   * @param {Object} policyData - Policy to validate
   * @returns {Object} Validation result with { valid: boolean, errors: string[] }
   */
  validatePolicy(policyData) {
    const errors = [];

    // Check required fields
    if (!policyData.type) {
      errors.push('Policy type is required');
    }

    // Validate policy type
    const validTypes = ['flexible', 'moderate', 'strict', 'custom', 'none'];
    if (policyData.type && !validTypes.includes(policyData.type)) {
      errors.push(`Invalid policy type: ${policyData.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // If no cancellation allowed, skip tier validation
    if (policyData.allowCancellation === false) {
      return { valid: errors.length === 0, errors };
    }

    // Validate tiers if present
    if (policyData.tiers && policyData.tiers.length > 0) {
      // Check for duplicate hours
      const hoursSet = new Set();
      for (const tier of policyData.tiers) {
        if (hoursSet.has(tier.hoursBeforeBooking)) {
          errors.push(`Duplicate tier at ${tier.hoursBeforeBooking} hours`);
        }
        hoursSet.add(tier.hoursBeforeBooking);

        // Validate hours are non-negative
        if (tier.hoursBeforeBooking < 0) {
          errors.push(`Hours before booking must be non-negative: ${tier.hoursBeforeBooking}`);
        }

        // Validate refund percentage (0-100)
        if (tier.refundPercentage < 0 || tier.refundPercentage > 100) {
          errors.push(`Invalid refund percentage: ${tier.refundPercentage}%. Must be between 0 and 100`);
        }

        // Validate description exists
        if (!tier.description || tier.description.trim() === '') {
          errors.push(`Tier at ${tier.hoursBeforeBooking} hours must have a description`);
        }
      }

      // Check tier ordering (should be descending by hours)
      const sortedTiers = [...policyData.tiers].sort((a, b) => b.hoursBeforeBooking - a.hoursBeforeBooking);
      for (let i = 0; i < sortedTiers.length - 1; i++) {
        // Refund percentages should be non-increasing (higher or equal refund for earlier cancellations)
        if (sortedTiers[i].refundPercentage < sortedTiers[i + 1].refundPercentage) {
          errors.push(
            `Tier ordering issue: Tier at ${sortedTiers[i].hoursBeforeBooking} hours has lower refund (${sortedTiers[i].refundPercentage}%) than tier at ${sortedTiers[i + 1].hoursBeforeBooking} hours (${sortedTiers[i + 1].refundPercentage}%)`
          );
        }
      }
    }

    // Validate processing fee percentage (0-100)
    if (policyData.processingFeePercentage !== undefined) {
      if (policyData.processingFeePercentage < 0 || policyData.processingFeePercentage > 100) {
        errors.push(`Invalid processing fee percentage: ${policyData.processingFeePercentage}%. Must be between 0 and 100`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get predefined policy templates
   * @returns {Object} Policy templates
   */
  getPolicyTemplates() {
    return POLICY_TEMPLATES;
  }
}

module.exports = new PolicyManager();
