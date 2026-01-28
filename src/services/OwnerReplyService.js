/**
 * OwnerReplyService
 * Manages owner responses to reviews
 */

const Review = require('../models/Review');
const Listing = require('../models/Listing');
const User = require('../models/User');

class OwnerReplyService {
  /**
   * Create owner reply to a review
   * @param {string} reviewId - Review ID
   * @param {string} ownerId - Owner ID
   * @param {string} replyText - Reply content
   * @returns {Promise<Object>} Updated review with reply
   */
  async createReply(reviewId, ownerId, replyText) {
    // Check if owner can reply
    const canReplyResult = await this.canReply(reviewId, ownerId);
    if (!canReplyResult.canReply) {
      throw new Error(canReplyResult.reason || 'Not authorized to reply to this review');
    }

    // Validate reply text
    this._validateReplyText(replyText);

    // Get the review
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }

    // Check if reply already exists
    if (review.ownerReply && review.ownerReply.text) {
      throw new Error('Reply already exists. Use updateReply to modify it.');
    }

    // Create the reply
    review.ownerReply = {
      text: replyText.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      isEdited: false
    };

    await review.save();

    return review;
  }

  /**
   * Update owner reply (within 24 hours)
   * @param {string} reviewId - Review ID
   * @param {string} ownerId - Owner ID
   * @param {string} replyText - Updated reply content
   * @returns {Promise<Object>} Updated review with reply
   */
  async updateReply(reviewId, ownerId, replyText) {
    // Check if owner can reply
    const canReplyResult = await this.canReply(reviewId, ownerId);
    if (!canReplyResult.canReply) {
      throw new Error(canReplyResult.reason || 'Not authorized to update this reply');
    }

    // Validate reply text
    this._validateReplyText(replyText);

    // Get the review
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }

    // Check if reply exists
    if (!review.ownerReply || !review.ownerReply.text) {
      throw new Error('No reply exists. Use createReply to add one.');
    }

    // Check edit window (24 hours from reply creation)
    const hoursSinceReply = (Date.now() - review.ownerReply.createdAt) / (1000 * 60 * 60);
    if (hoursSinceReply > 24) {
      throw new Error('Replies can only be edited within 24 hours of creation. Please contact support if you need to make changes.');
    }

    // Update the reply
    review.ownerReply.text = replyText.trim();
    review.ownerReply.updatedAt = new Date();
    review.ownerReply.isEdited = true;

    await review.save();

    return review;
  }

  /**
   * Check if owner can reply to review
   * @param {string} reviewId - Review ID
   * @param {string} ownerId - Owner ID
   * @returns {Promise<Object>} Authorization result
   */
  async canReply(reviewId, ownerId) {
    const review = await Review.findById(reviewId).populate('listingId');
    
    if (!review) {
      return { 
        canReply: false, 
        reason: 'Review not found' 
      };
    }

    // Get the listing to verify ownership
    const listing = review.listingId;
    if (!listing) {
      return { 
        canReply: false, 
        reason: 'Listing not found' 
      };
    }

    // Check if the user is the owner of the listing
    const listingOwnerId = String(listing.ownerId || listing.owner || listing.userId);
    const requestOwnerId = String(ownerId);

    if (listingOwnerId !== requestOwnerId) {
      return { 
        canReply: false, 
        reason: 'You can only reply to reviews for your own listings' 
      };
    }

    return { 
      canReply: true 
    };
  }

  /**
   * Get reviews for owner's listings with reply status
   * @param {string} ownerId - Owner ID
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Object>} Reviews with statistics
   */
  async getOwnerReviews(ownerId, options = {}) {
    const {
      listingId = null,
      status = 'visible',
      hasReply = null,
      page = 1,
      limit = 20,
      sort = 'recent'
    } = options;

    // Build query
    const query = { ownerId };
    
    if (listingId) {
      query.listingId = listingId;
    }
    
    if (status) {
      query.status = status;
    }

    // Filter by reply status
    if (hasReply === true) {
      query['ownerReply.text'] = { $exists: true, $ne: null, $ne: '' };
    } else if (hasReply === false) {
      query.$or = [
        { 'ownerReply.text': { $exists: false } },
        { 'ownerReply.text': null },
        { 'ownerReply.text': '' }
      ];
    }

    // Determine sort order
    let sortOption = { createdAt: -1 }; // Most recent by default
    if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'highest') {
      sortOption = { rating: -1, createdAt: -1 };
    } else if (sort === 'lowest') {
      sortOption = { rating: 1, createdAt: -1 };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('userId', 'name fullName firstName avatar')
        .populate('listingId', 'venue shortDesc images')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(query)
    ]);

    // Calculate statistics
    const stats = await this._calculateOwnerStats(ownerId);

    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats
    };
  }

  /**
   * Calculate owner review statistics
   * @param {string} ownerId - Owner ID
   * @returns {Promise<Object>} Statistics
   * @private
   */
  async _calculateOwnerStats(ownerId) {
    const allReviews = await Review.find({ 
      ownerId, 
      status: 'visible' 
    }).lean();

    const totalReviews = allReviews.length;
    const reviewsWithReply = allReviews.filter(r => r.ownerReply && r.ownerReply.text).length;
    const replyRate = totalReviews > 0 ? Math.round((reviewsWithReply / totalReviews) * 100) : 0;

    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0;

    return {
      totalReviews,
      reviewsWithReply,
      reviewsWithoutReply: totalReviews - reviewsWithReply,
      replyRate,
      averageRating
    };
  }

  /**
   * Validate reply text
   * @param {string} replyText - Reply text to validate
   * @throws {Error} If validation fails
   * @private
   */
  _validateReplyText(replyText) {
    if (!replyText || typeof replyText !== 'string') {
      throw new Error('Reply text is required');
    }

    const trimmedText = replyText.trim();

    if (trimmedText.length === 0) {
      throw new Error('Reply text cannot be empty');
    }

    if (trimmedText.length > 300) {
      throw new Error('Reply text must not exceed 300 characters');
    }

    if (trimmedText.length < 5) {
      throw new Error('Reply text must be at least 5 characters');
    }
  }
}

module.exports = new OwnerReplyService();
