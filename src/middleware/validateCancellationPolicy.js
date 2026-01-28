const PolicyManager = require("../services/PolicyManager");

/**
 * Middleware to validate cancellation policy data
 * Validates policy structure, tier ordering, and refund percentages
 */
const validateCancellationPolicy = (req, res, next) => {
  try {
    const policyData = req.body;

    // Validate policy structure
    if (!policyData || typeof policyData !== 'object') {
      return res.status(400).json({ 
        message: "Invalid policy data",
        errors: ["Policy data must be an object"]
      });
    }

    // Use PolicyManager's validation
    const validation = PolicyManager.validatePolicy(policyData);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        message: "Invalid policy configuration",
        errors: validation.errors 
      });
    }

    // Additional validation checks
    const errors = [];

    // Check tier ordering (hours should be in descending order)
    if (policyData.tiers && Array.isArray(policyData.tiers)) {
      const sortedTiers = [...policyData.tiers].sort((a, b) => 
        b.hoursBeforeBooking - a.hoursBeforeBooking
      );
      
      for (let i = 0; i < policyData.tiers.length; i++) {
        if (policyData.tiers[i].hoursBeforeBooking !== sortedTiers[i].hoursBeforeBooking) {
          errors.push("Tiers must be ordered by hoursBeforeBooking in descending order");
          break;
        }
      }

      // Check for duplicate hours
      const hoursSet = new Set();
      for (const tier of policyData.tiers) {
        if (hoursSet.has(tier.hoursBeforeBooking)) {
          errors.push(`Duplicate tier at ${tier.hoursBeforeBooking} hours`);
        }
        hoursSet.add(tier.hoursBeforeBooking);
      }

      // Verify refund percentages are between 0 and 100
      for (const tier of policyData.tiers) {
        if (tier.refundPercentage < 0 || tier.refundPercentage > 100) {
          errors.push(`Invalid refund percentage: ${tier.refundPercentage}% (must be 0-100)`);
        }
      }

      // Check that hours are non-negative
      for (const tier of policyData.tiers) {
        if (tier.hoursBeforeBooking < 0) {
          errors.push(`Invalid hours before booking: ${tier.hoursBeforeBooking} (must be >= 0)`);
        }
      }
    }

    // Verify processing fee percentage
    if (policyData.processingFeePercentage !== undefined) {
      if (policyData.processingFeePercentage < 0 || policyData.processingFeePercentage > 100) {
        errors.push(`Invalid processing fee: ${policyData.processingFeePercentage}% (must be 0-100)`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        message: "Policy validation failed",
        errors 
      });
    }

    // Validation passed
    next();
  } catch (e) {
    res.status(500).json({ 
      message: "Policy validation error",
      error: e.message 
    });
  }
};

module.exports = validateCancellationPolicy;
