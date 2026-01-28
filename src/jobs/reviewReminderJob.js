// src/jobs/reviewReminderJob.js
const cron = require('node-cron');
const Booking = require('../models/Booking');
const NotificationService = require('../services/NotificationService');

/**
 * Review Reminder Background Job
 * 
 * Runs daily at 9 AM to send review reminders to clients
 * who completed bookings 2-3 days ago and haven't left a review yet.
 */
class ReviewReminderJob {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      totalReminders: 0,
      lastRunReminders: 0,
      errors: 0,
    };
  }

  /**
   * Start the cron job
   * Runs daily at 9:00 AM
   */
  start() {
    console.log('[ReviewReminderJob] Starting review reminder job...');
    
    // Run daily at 9:00 AM
    // Format: minute hour day month weekday
    // '0 9 * * *' = At 9:00 AM every day
    this.job = cron.schedule('0 9 * * *', async () => {
      await this.run();
    });

    console.log('[ReviewReminderJob] Job scheduled to run daily at 9:00 AM');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      console.log('[ReviewReminderJob] Job stopped');
    }
  }

  /**
   * Run the job manually (for testing)
   */
  async run() {
    if (this.isRunning) {
      console.log('[ReviewReminderJob] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();
    this.stats.totalRuns++;
    this.stats.lastRunReminders = 0;

    console.log('[ReviewReminderJob] Starting review reminder job run...');

    try {
      // Find completed bookings from 2-3 days ago without reviews
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);

      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(23, 59, 59, 999);

      const eligibleBookings = await Booking.find({
        status: 'completed',
        endDate: {
          $gte: threeDaysAgo,
          $lte: twoDaysAgo,
        },
        hasReview: false,
      })
        .populate('userId')
        .populate('listingId')
        .lean();

      console.log(`[ReviewReminderJob] Found ${eligibleBookings.length} eligible bookings`);

      // Send reminders
      for (const booking of eligibleBookings) {
        try {
          // Check if reminder was already sent
          if (booking.reviewReminderSent) {
            console.log(`[ReviewReminderJob] Reminder already sent for booking ${booking._id}`);
            continue;
          }

          // Send reminder
          const result = await NotificationService.sendReviewReminder(booking._id);

          if (result.sent) {
            // Mark reminder as sent
            await Booking.findByIdAndUpdate(booking._id, {
              reviewReminderSent: true,
              reviewReminderSentAt: new Date(),
            });

            this.stats.lastRunReminders++;
            this.stats.totalReminders++;

            console.log(`[ReviewReminderJob] Reminder sent for booking ${booking._id}`);
          } else {
            console.log(`[ReviewReminderJob] Reminder not sent for booking ${booking._id}: ${result.reason || result.error}`);
          }
        } catch (error) {
          console.error(`[ReviewReminderJob] Error sending reminder for booking ${booking._id}:`, error);
          this.stats.errors++;
        }
      }

      console.log(`[ReviewReminderJob] Job completed. Sent ${this.stats.lastRunReminders} reminders.`);
    } catch (error) {
      console.error('[ReviewReminderJob] Error running job:', error);
      this.stats.errors++;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get job statistics
   */
  getStats() {
    return {
      ...this.stats,
      lastRun: this.lastRun,
      isRunning: this.isRunning,
    };
  }
}

// Export singleton instance
module.exports = new ReviewReminderJob();
