// src/routes/jobs.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const reviewReminderJob = require('../jobs/reviewReminderJob');

/**
 * GET /api/jobs/review-reminder/stats
 * Get review reminder job statistics
 * Admin only
 */
router.get('/review-reminder/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const stats = reviewReminderJob.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[JobsAPI] Error getting job stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job statistics',
    });
  }
});

/**
 * POST /api/jobs/review-reminder/run
 * Manually trigger the review reminder job
 * Admin only
 */
router.post('/review-reminder/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Check if job is already running
    const stats = reviewReminderJob.getStats();
    if (stats.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Job is already running',
      });
    }

    // Run job asynchronously
    reviewReminderJob.run().catch(error => {
      console.error('[JobsAPI] Error running job:', error);
    });

    res.json({
      success: true,
      message: 'Review reminder job started',
    });
  } catch (error) {
    console.error('[JobsAPI] Error starting job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start job',
    });
  }
});

module.exports = router;
