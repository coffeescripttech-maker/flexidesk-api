/**
 * ContentModerationService
 * Automatically flag and moderate inappropriate content in reviews
 */

const Review = require('../models/Review');

// Profanity word list (basic implementation)
// In production, consider using a more comprehensive list or external service
const PROFANITY_LIST = [
  'damn', 'hell', 'crap', 'suck', 'sucks', 'shit', 'fuck', 'fucking',
  'bitch', 'ass', 'asshole', 'bastard', 'piss', 'dick', 'cock',
  'pussy', 'slut', 'whore', 'fag', 'nigger', 'retard'
];

class ContentModerationService {
  constructor() {
    // Create regex pattern for profanity detection
    this.profanityPattern = new RegExp(
      '\\b(' + PROFANITY_LIST.join('|') + ')\\b',
      'gi'
    );
  }

  /**
   * Check if text contains profanity
   * @param {string} text - Text to check
   * @returns {boolean} True if profanity detected
   */
  isProfane(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    return this.profanityPattern.test(text);
  }

  /**
   * Clean profanity from text
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   */
  cleanProfanity(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    return text.replace(this.profanityPattern, '****');
  }

  /**
   * Check review content for violations
   * @param {string} content - Review text
   * @returns {Object} Moderation result
   */
  checkContent(content) {
    const violations = [];

    if (!content || typeof content !== 'string') {
      return {
        hasViolations: true,
        violations: [{ type: 'invalid_content', message: 'Content is required' }],
        shouldAutoFlag: false,
        shouldReject: true
      };
    }

    const trimmedContent = content.trim();

    // Check minimum length (10 characters)
    if (trimmedContent.length < 10) {
      violations.push({ 
        type: 'too_short', 
        message: 'Review must be at least 10 characters' 
      });
    }

    // Check for profanity
    if (this.isProfane(trimmedContent)) {
      violations.push({ 
        type: 'profanity', 
        message: 'Review contains inappropriate language' 
      });
    }

    // Check for external links (URLs)
    const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
    if (urlPattern.test(trimmedContent)) {
      violations.push({ 
        type: 'external_links', 
        message: 'Reviews cannot contain external links' 
      });
    }

    // Check for email addresses
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    if (emailPattern.test(trimmedContent)) {
      violations.push({ 
        type: 'contact_info', 
        message: 'Reviews cannot contain email addresses' 
      });
    }

    // Check for phone numbers (various formats)
    const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,}/g;
    if (phonePattern.test(trimmedContent)) {
      violations.push({ 
        type: 'contact_info', 
        message: 'Reviews cannot contain phone numbers' 
      });
    }

    // Determine actions based on violations
    const hasViolations = violations.length > 0;
    const shouldAutoFlag = violations.some(v => 
      ['profanity', 'external_links', 'contact_info'].includes(v.type)
    );
    const shouldReject = violations.some(v => v.type === 'too_short');

    return {
      hasViolations,
      violations,
      shouldAutoFlag,
      shouldReject
    };
  }

  /**
   * Flag review for admin review
   * @param {string} reviewId - Review ID
   * @param {string} reason - Flag reason
   * @param {string} flaggedBy - User who flagged (or 'system' for auto-flag)
   * @returns {Promise<Object>} Updated review
   */
  async flagReview(reviewId, reason, flaggedBy = 'system') {
    const review = await Review.findById(reviewId);
    
    if (!review) {
      throw new Error('Review not found');
    }

    // Update review status to flagged
    review.status = 'flagged';
    review.flagReason = reason;
    review.flaggedBy = flaggedBy === 'system' ? null : flaggedBy;
    review.flaggedAt = new Date();

    await review.save();

    return review;
  }

  /**
   * Auto-flag reviews based on content rules
   * @param {Object} review - Review object or review data
   * @returns {Promise<Object>} Result with flagged status and reason
   */
  async autoFlag(review) {
    // If review is a string (just the comment), check it directly
    const content = typeof review === 'string' ? review : review.comment;
    
    if (!content) {
      return { 
        shouldFlag: false, 
        reason: null 
      };
    }

    // Check content for violations
    const moderationResult = this.checkContent(content);

    // If should auto-flag, flag the review
    if (moderationResult.shouldAutoFlag) {
      const flagReasons = moderationResult.violations
        .filter(v => ['profanity', 'external_links', 'contact_info'].includes(v.type))
        .map(v => v.type)
        .join(', ');

      // If review is an object with _id, update it in database
      if (review._id) {
        await this.flagReview(review._id, flagReasons, 'system');
      }

      return {
        shouldFlag: true,
        reason: flagReasons,
        violations: moderationResult.violations
      };
    }

    return { 
      shouldFlag: false, 
      reason: null 
    };
  }

  /**
   * Get flagged reviews for admin moderation
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Flagged reviews
   */
  async getFlaggedReviews(filters = {}) {
    const {
      status = 'flagged',
      reason = null,
      page = 1,
      limit = 20
    } = filters;

    // Build query
    const query = { status };
    
    if (reason) {
      query.flagReason = { $regex: reason, $options: 'i' };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('userId', 'name fullName firstName avatar')
        .populate('listingId', 'title name')
        .populate('flaggedBy', 'name fullName firstName')
        .sort({ flaggedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(query)
    ]);

    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Moderate a flagged review (admin action)
   * @param {string} reviewId - Review ID
   * @param {string} action - Action to take (approve, hide, delete)
   * @param {string} adminId - Admin user ID
   * @param {string} notes - Moderation notes
   * @returns {Promise<Object>} Updated review
   */
  async moderateReview(reviewId, action, adminId, notes = '') {
    const review = await Review.findById(reviewId);
    
    if (!review) {
      throw new Error('Review not found');
    }

    // Validate action
    const validActions = ['approve', 'hide', 'delete'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
    }

    // Apply action
    switch (action) {
      case 'approve':
        review.status = 'visible';
        review.flagReason = null;
        break;
      
      case 'hide':
        review.status = 'hidden';
        break;
      
      case 'delete':
        review.status = 'deleted';
        break;
    }

    // Update moderation metadata
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    review.moderationNotes = notes;

    await review.save();

    // If review was approved or hidden, recalculate listing rating
    if (action === 'approve' || action === 'hide') {
      const ReviewService = require('./ReviewService');
      await ReviewService.calculateListingRating(review.listingId);
    }

    return review;
  }

  /**
   * Clean content by removing profanity (optional utility)
   * @param {string} content - Content to clean
   * @returns {string} Cleaned content
   */
  cleanContent(content) {
    if (!content || typeof content !== 'string') {
      return content;
    }
    
    return this.cleanProfanity(content);
  }
}

module.exports = new ContentModerationService();
