// src/services/NotificationService.js
const mailer = require('../utils/mailer');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const CancellationRequest = require('../models/CancellationRequest');

/**
 * NotificationService
 * 
 * Handles sending notifications for cancellation and refund events.
 * Supports email and in-app notifications with delivery tracking.
 */
class NotificationService {
  /**
   * Send cancellation confirmation to client
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Notification result
   */
  async sendCancellationConfirmation(cancellationRequestId) {
    try {
      const request = await CancellationRequest.findById(cancellationRequestId)
        .populate('clientId')
        .populate('bookingId')
        .populate('listingId');

      if (!request) {
        throw new Error('Cancellation request not found');
      }

      const user = request.clientId;
      const booking = request.bookingId;
      const listing = request.listingId;

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'cancellation')) {
        console.log('[NotificationService] Email notifications disabled for user:', user._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendCancellationConfirmationEmail({
        to: user.email,
        user,
        booking,
        listing,
        refundCalculation: request.refundCalculation,
        cancellationRequest: request,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'cancellation_confirmation',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: cancellationRequestId,
        referenceType: 'CancellationRequest',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending cancellation confirmation:', error);
      throw error;
    }
  }

  /**
   * Send refund request notification to owner
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Notification result
   */
  async sendRefundRequestNotification(cancellationRequestId) {
    try {
      const request = await CancellationRequest.findById(cancellationRequestId)
        .populate('clientId')
        .populate('ownerId')
        .populate('bookingId')
        .populate('listingId');

      if (!request) {
        throw new Error('Cancellation request not found');
      }

      const owner = request.ownerId;
      const client = request.clientId;
      const booking = request.bookingId;
      const listing = request.listingId;

      // Check owner notification preferences
      if (!this._shouldSendEmail(owner, 'refund_request')) {
        console.log('[NotificationService] Email notifications disabled for owner:', owner._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendRefundRequestNotificationEmail({
        to: owner.email,
        owner,
        client,
        booking,
        listing,
        refundCalculation: request.refundCalculation,
        cancellationRequest: request,
      });

      // Track delivery
      await this._trackNotification({
        userId: owner._id,
        type: 'refund_request',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: cancellationRequestId,
        referenceType: 'CancellationRequest',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: owner.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending refund request notification:', error);
      throw error;
    }
  }

  /**
   * Send refund approved notification to client
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Notification result
   */
  async sendRefundApproved(cancellationRequestId) {
    try {
      const request = await CancellationRequest.findById(cancellationRequestId)
        .populate('clientId')
        .populate('bookingId')
        .populate('listingId');

      if (!request) {
        throw new Error('Cancellation request not found');
      }

      const user = request.clientId;
      const booking = request.bookingId;
      const listing = request.listingId;

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'refund_approved')) {
        console.log('[NotificationService] Email notifications disabled for user:', user._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendRefundApprovedEmail({
        to: user.email,
        user,
        booking,
        listing,
        refundCalculation: request.refundCalculation,
        customRefundAmount: request.customRefundAmount,
        customRefundNote: request.customRefundNote,
        cancellationRequest: request,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'refund_approved',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: cancellationRequestId,
        referenceType: 'CancellationRequest',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending refund approved notification:', error);
      throw error;
    }
  }

  /**
   * Send refund rejected notification to client
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Notification result
   */
  async sendRefundRejected(cancellationRequestId) {
    try {
      const request = await CancellationRequest.findById(cancellationRequestId)
        .populate('clientId')
        .populate('bookingId')
        .populate('listingId');

      if (!request) {
        throw new Error('Cancellation request not found');
      }

      const user = request.clientId;
      const booking = request.bookingId;
      const listing = request.listingId;

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'refund_rejected')) {
        console.log('[NotificationService] Email notifications disabled for user:', user._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendRefundRejectedEmail({
        to: user.email,
        user,
        booking,
        listing,
        rejectionReason: request.rejectionReason,
        cancellationRequest: request,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'refund_rejected',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: cancellationRequestId,
        referenceType: 'CancellationRequest',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending refund rejected notification:', error);
      throw error;
    }
  }

  /**
   * Send automatic refund processed notification to owner
   * @param {string} cancellationRequestId - Cancellation request ID
   * @returns {Promise<Object>} Notification result
   */
  async sendAutomaticRefundProcessed(cancellationRequestId) {
    try {
      const request = await CancellationRequest.findById(cancellationRequestId)
        .populate('clientId')
        .populate('ownerId')
        .populate('bookingId')
        .populate('listingId');

      if (!request) {
        throw new Error('Cancellation request not found');
      }

      const owner = request.ownerId;
      const client = request.clientId;
      const booking = request.bookingId;
      const listing = request.listingId;

      // Check owner notification preferences
      if (!this._shouldSendEmail(owner, 'automatic_refund')) {
        console.log('[NotificationService] Email notifications disabled for owner:', owner._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendAutomaticRefundProcessedEmail({
        to: owner.email,
        owner,
        client,
        booking,
        listing,
        refundCalculation: request.refundCalculation,
        cancellationRequest: request,
      });

      // Track delivery
      await this._trackNotification({
        userId: owner._id,
        type: 'automatic_refund_processed',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: cancellationRequestId,
        referenceType: 'CancellationRequest',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: owner.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending automatic refund notification:', error);
      throw error;
    }
  }

  /**
   * Check if email notifications should be sent to user
   * @param {Object} user - User object
   * @param {string} notificationType - Type of notification
   * @returns {boolean} Whether to send email
   * @private
   */
  _shouldSendEmail(user, notificationType) {
    // If user has notification preferences, check them
    if (user.notificationPreferences) {
      const prefs = user.notificationPreferences;
      
      // Check if email is enabled globally
      if (prefs.email === false) {
        return false;
      }

      // Check specific notification type
      if (prefs[notificationType] === false) {
        return false;
      }
    }

    // Default: send email
    return true;
  }

  /**
   * Track notification delivery
   * @param {Object} data - Notification tracking data
   * @returns {Promise<void>}
   * @private
   */
  async _trackNotification(data) {
    try {
      // For now, just log the notification
      // In the future, this could store in a NotificationLog collection
      console.log('[NotificationService] Notification tracked:', {
        userId: data.userId,
        type: data.type,
        channel: data.channel,
        status: data.status,
        timestamp: new Date(),
      });

      // TODO: Implement NotificationLog model and store tracking data
      // await NotificationLog.create({
      //   ...data,
      //   sentAt: new Date(),
      // });
    } catch (error) {
      console.error('[NotificationService] Error tracking notification:', error);
      // Don't throw - tracking failure shouldn't break notification sending
    }
  }

  /**
   * Send multiple notifications in batch
   * @param {Array} notifications - Array of notification configs
   * @returns {Promise<Array>} Results for each notification
   */
  async sendBatch(notifications) {
    const results = [];

    for (const notification of notifications) {
      try {
        let result;
        
        switch (notification.type) {
          case 'cancellation_confirmation':
            result = await this.sendCancellationConfirmation(notification.cancellationRequestId);
            break;
          case 'refund_request':
            result = await this.sendRefundRequestNotification(notification.cancellationRequestId);
            break;
          case 'refund_approved':
            result = await this.sendRefundApproved(notification.cancellationRequestId);
            break;
          case 'refund_rejected':
            result = await this.sendRefundRejected(notification.cancellationRequestId);
            break;
          case 'automatic_refund':
            result = await this.sendAutomaticRefundProcessed(notification.cancellationRequestId);
            break;
          default:
            result = { sent: false, error: 'Unknown notification type' };
        }

        results.push({ ...notification, result });
      } catch (error) {
        results.push({ ...notification, result: { sent: false, error: error.message } });
      }
    }

    return results;
  }

  /**
   * Notify client when owner replies to their review
   * @param {string} reviewId - Review ID
   * @returns {Promise<Object>} Notification result
   */
  async notifyClientOfOwnerReply(reviewId) {
    try {
      const Review = require('../models/Review');
      
      const review = await Review.findById(reviewId)
        .populate('userId')
        .populate('listingId')
        .populate('ownerId');

      if (!review) {
        throw new Error('Review not found');
      }

      const client = review.userId;
      const owner = review.ownerId;
      const listing = review.listingId;

      if (!client || !owner || !listing) {
        throw new Error('Missing required data for notification');
      }

      // Check client notification preferences
      if (!this._shouldSendEmail(client, 'owner_reply')) {
        console.log('[NotificationService] Email notifications disabled for client:', client._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendOwnerReplyNotificationEmail({
        to: client.email,
        client,
        owner,
        listing,
        review,
        reply: review.ownerReply,
      });

      // Track delivery
      await this._trackNotification({
        userId: client._id,
        type: 'owner_reply',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: reviewId,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: client.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending owner reply notification:', error);
      // Don't throw - notification failure shouldn't break the reply creation
      return { sent: false, error: error.message };
    }
  }

  /**
   * Notify owner of new review
   * @param {string} reviewId - Review ID
   * @returns {Promise<Object>} Notification result
   */
  async notifyOwnerOfNewReview(reviewId) {
    try {
      const Review = require('../models/Review');
      
      const review = await Review.findById(reviewId)
        .populate('userId')
        .populate('listingId')
        .populate('ownerId');

      if (!review) {
        throw new Error('Review not found');
      }

      const client = review.userId;
      const owner = review.ownerId;
      const listing = review.listingId;

      if (!client || !owner || !listing) {
        throw new Error('Missing required data for notification');
      }

      // Check owner notification preferences
      if (!this._shouldSendEmail(owner, 'new_review')) {
        console.log('[NotificationService] Email notifications disabled for owner:', owner._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendNewReviewNotificationEmail({
        to: owner.email,
        owner,
        client,
        listing,
        review,
      });

      // Track delivery
      await this._trackNotification({
        userId: owner._id,
        type: 'new_review',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: reviewId,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: owner.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending new review notification:', error);
      // Don't throw - notification failure shouldn't break review creation
      return { sent: false, error: error.message };
    }
  }

  /**
   * Send review reminder to client (3 days after booking)
   * @param {string} bookingId - Booking ID
   * @returns {Promise<Object>} Notification result
   */
  async sendReviewReminder(bookingId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('userId')
        .populate('listingId');

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if review already exists
      if (booking.hasReview) {
        console.log('[NotificationService] Booking already has review:', bookingId);
        return { sent: false, reason: 'already_reviewed' };
      }

      const user = booking.userId;
      const listing = booking.listingId;

      if (!user || !listing) {
        throw new Error('Missing required data for notification');
      }

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'review_reminder')) {
        console.log('[NotificationService] Email notifications disabled for user:', user._id);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendReviewReminderEmail({
        to: user.email,
        user,
        booking,
        listing,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'review_reminder',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: bookingId,
        referenceType: 'Booking',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending review reminder:', error);
      return { sent: false, error: error.message };
    }
  }

  /**
   * Notify admin of flagged review
   * @param {string} reviewId - Review ID
   * @returns {Promise<Object>} Notification result
   */
  async notifyAdminOfFlaggedReview(reviewId) {
    try {
      const Review = require('../models/Review');
      
      const review = await Review.findById(reviewId)
        .populate('listingId');

      if (!review) {
        throw new Error('Review not found');
      }

      const listing = review.listingId;

      if (!listing) {
        throw new Error('Missing required data for notification');
      }

      const flaggedBy = review.flaggedBy ? 'user' : 'system';

      // Send email notification to admin
      const emailSent = await mailer.sendReviewFlaggedNotificationEmail({
        to: process.env.ADMIN_EMAIL || 'admin@flexidesk.com',
        review,
        listing,
        flagReason: review.flagReason,
        flaggedBy,
      });

      // Track delivery
      await this._trackNotification({
        userId: 'admin',
        type: 'review_flagged',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: reviewId,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: process.env.ADMIN_EMAIL || 'admin@flexidesk.com',
      };
    } catch (error) {
      console.error('[NotificationService] Error sending flagged review notification:', error);
      // Don't throw - notification failure shouldn't break flagging
      return { sent: false, error: error.message };
    }
  }

  /**
   * Notify user who flagged a review about moderation resolution
   * @param {string} userId - User ID who flagged
   * @param {Object} review - Review object
   * @param {string} action - Moderation action (approved, hidden, deleted)
   * @returns {Promise<Object>} Notification result
   */
  async notifyFlagResolution(userId, review, action) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        console.log('[NotificationService] User not found:', userId);
        return { sent: false, reason: 'user_not_found' };
      }

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'moderation')) {
        console.log('[NotificationService] Email notifications disabled for user:', userId);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendFlagResolutionEmail({
        to: user.email,
        user,
        review,
        action,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'flag_resolution',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: review._id,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending flag resolution notification:', error);
      return { sent: false, error: error.message };
    }
  }

  /**
   * Notify review author that their review was hidden
   * @param {string} userId - Review author ID
   * @param {Object} review - Review object
   * @param {string} reason - Reason for hiding
   * @returns {Promise<Object>} Notification result
   */
  async notifyReviewHidden(userId, review, reason) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        console.log('[NotificationService] User not found:', userId);
        return { sent: false, reason: 'user_not_found' };
      }

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'moderation')) {
        console.log('[NotificationService] Email notifications disabled for user:', userId);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendReviewHiddenEmail({
        to: user.email,
        user,
        review,
        reason,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'review_hidden',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: review._id,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending review hidden notification:', error);
      return { sent: false, error: error.message };
    }
  }

  /**
   * Notify review author that their review was deleted
   * @param {string} userId - Review author ID
   * @param {Object} review - Review object
   * @param {string} reason - Reason for deletion
   * @returns {Promise<Object>} Notification result
   */
  async notifyReviewDeleted(userId, review, reason) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        console.log('[NotificationService] User not found:', userId);
        return { sent: false, reason: 'user_not_found' };
      }

      // Check user notification preferences
      if (!this._shouldSendEmail(user, 'moderation')) {
        console.log('[NotificationService] Email notifications disabled for user:', userId);
        return { sent: false, reason: 'user_preference' };
      }

      // Send email notification
      const emailSent = await mailer.sendReviewDeletedEmail({
        to: user.email,
        user,
        review,
        reason,
      });

      // Track delivery
      await this._trackNotification({
        userId: user._id,
        type: 'review_deleted',
        channel: 'email',
        status: emailSent ? 'sent' : 'failed',
        referenceId: review._id,
        referenceType: 'Review',
      });

      return {
        sent: emailSent,
        channel: 'email',
        recipient: user.email,
      };
    } catch (error) {
      console.error('[NotificationService] Error sending review deleted notification:', error);
      return { sent: false, error: error.message };
    }
  }
}

module.exports = new NotificationService();
