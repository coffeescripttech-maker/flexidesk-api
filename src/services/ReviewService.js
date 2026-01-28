/**
 * ReviewService
 * Manages review creation, updates, eligibility checking, and rating calculations
 */

const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');

class ReviewService {
  /**
   * Create a new review for a booking
   * @param {string} bookingId - Booking ID
   * @param {string} userId - User creating review
   * @param {Object} reviewData - Review content (rating, comment, photos)
   * @returns {Promise<Object>} Created review
   */
  async createReview(bookingId, userId, reviewData) {
    // Check eligibility first
    const eligibility = await this.checkEligibility(bookingId, userId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || 'Not eligible to review this booking');
    }

    // Validate review data
    this._validateReviewData(reviewData);

    // Get booking details
    const booking = await Booking.findById(bookingId).populate('listingId');
    if (!booking) {
      throw new Error('Booking not found');
    }

    const listingId = booking.listingId._id || booking.listingId;
    const ownerId = booking.ownerId;

    // Create the review
    const review = await Review.create({
      bookingId,
      listingId,
      userId,
      ownerId,
      rating: reviewData.rating,
      comment: reviewData.comment,
      photos: reviewData.photos || [],
      status: 'visible'
    });

    // Update booking to mark as reviewed
    await Booking.findByIdAndUpdate(bookingId, {
      hasReview: true,
      reviewId: review._id
    });

    // Recalculate listing rating
    await this.calculateListingRating(listingId);

    return review;
  }

  /**
   * Check if user can edit a review
   * @param {string} reviewId - Review ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Edit eligibility result
   */
  async checkEditEligibility(reviewId, userId) {
    const review = await Review.findById(reviewId);
    
    if (!review) {
      return { 
        eligible: false, 
        reason: 'Review not found',
        hoursRemaining: 0
      };
    }

    // Check ownership
    if (review.userId.toString() !== userId.toString()) {
      return { 
        eligible: false, 
        reason: 'You can only edit your own reviews',
        hoursRemaining: 0
      };
    }

    // Check edit window (24 hours)
    const hoursSinceCreation = (Date.now() - review.createdAt) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, 24 - hoursSinceCreation);
    
    if (hoursSinceCreation > 24) {
      return { 
        eligible: false, 
        reason: 'Reviews can only be edited within 24 hours of submission. Please contact support if you need to make changes.',
        hoursRemaining: 0
      };
    }

    return { 
      eligible: true,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10 // Round to 1 decimal
    };
  }

  /**
   * Update an existing review (within 24 hours)
   * @param {string} reviewId - Review ID
   * @param {string} userId - User updating review
   * @param {Object} updates - Updated content
   * @returns {Promise<Object>} Updated review
   */
  async updateReview(reviewId, userId, updates) {
    // Check edit eligibility first
    const eligibility = await this.checkEditEligibility(reviewId, userId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || 'Not eligible to edit this review');
    }

    const review = await Review.findById(reviewId);

    // Validate updated data
    if (updates.rating !== undefined || updates.comment !== undefined) {
      this._validateReviewData({
        rating: updates.rating !== undefined ? updates.rating : review.rating,
        comment: updates.comment !== undefined ? updates.comment : review.comment
      });
    }

    // Update fields
    if (updates.rating !== undefined) {
      review.rating = updates.rating;
    }
    if (updates.comment !== undefined) {
      review.comment = updates.comment;
    }
    if (updates.photos !== undefined) {
      review.photos = updates.photos;
    }

    // Mark as edited
    review.isEdited = true;
    review.editedAt = new Date();

    await review.save();

    // Recalculate listing rating if rating changed
    if (updates.rating !== undefined) {
      await this.calculateListingRating(review.listingId);
    }

    return review;
  }

  /**
   * Check if user can review a booking
   * @param {string} bookingId - Booking ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Eligibility result
   */
  async checkEligibility(bookingId, userId) {
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return { eligible: false, reason: 'Booking not found', daysRemaining: 0 };
    }

    // Check ownership
    if (booking.userId.toString() !== userId.toString()) {
      return { eligible: false, reason: 'You can only review your own bookings', daysRemaining: 0 };
    }

    // Check booking status - must be completed or paid with past start date
    if (booking.status === 'cancelled') {
      return { eligible: false, reason: 'Cannot review cancelled bookings', daysRemaining: 0 };
    }

    if (booking.status === 'pending_payment' || booking.status === 'awaiting_payment') {
      return { eligible: false, reason: 'Cannot review bookings with pending payment', daysRemaining: 0 };
    }

    // Check if booking has ended (booking end date must be in the past)
    // TESTING MODE: Bypass date validation to allow immediate reviews for completed bookings
    const now = new Date();
    const endDate = new Date(booking.endDate);
    
    /*
    if (endDate > now && booking.status !== 'completed') {
      const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      return { 
        eligible: false, 
        reason: `You can review this booking after it completes on ${endDate.toLocaleDateString()}`,
        daysRemaining: 0,
        daysUntilAvailable: daysUntilEnd
      };
    }

    // Check review timing window (0-90 days after booking end)
    const daysSinceEnd = (now - endDate) / (1000 * 60 * 60 * 24);
    
    if (daysSinceEnd < 0) {
      // Booking hasn't ended yet
      const daysUntilEnd = Math.ceil(Math.abs(daysSinceEnd));
      return { 
        eligible: false, 
        reason: `You can review this booking after it completes on ${endDate.toLocaleDateString()}`,
        daysRemaining: 0,
        daysUntilAvailable: daysUntilEnd
      };
    }
    */
    
    const daysSinceEnd = (now - endDate) / (1000 * 60 * 60 * 24);
    
    if (daysSinceEnd > 90) {
      return { 
        eligible: false, 
        reason: 'Review period has expired (90 days after booking end date)',
        daysRemaining: 0,
        daysExpired: Math.floor(daysSinceEnd - 90)
      };
    }

    // Check for existing review
    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return { eligible: false, reason: 'You have already reviewed this booking', daysRemaining: 0 };
    }

    // Calculate days remaining to review
    const daysRemaining = Math.floor(90 - daysSinceEnd);

    return { 
      eligible: true, 
      daysRemaining,
      daysSinceEnd: Math.floor(daysSinceEnd)
    };
  }

  /**
   * Get reviews for a listing
   * @param {string} listingId - Listing ID
   * @param {Object} options - Sort, filter, pagination
   * @returns {Promise<Object>} Reviews with metadata
   */
  async getListingReviews(listingId, options = {}) {
    const {
      sort = 'recent',
      status = 'visible',
      page = 1,
      limit = 20,
      isAdmin = false
    } = options;

    // Build query
    const query = { listingId };
    
    // Non-admin users can only see visible reviews
    if (!isAdmin) {
      query.status = 'visible';
    } else if (status) {
      // Admins can filter by status
      query.status = status;
    }

    // Determine sort order
    let sortOption = { createdAt: -1 }; // Most recent by default
    if (sort === 'highest') {
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
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(query)
    ]);

    // Get rating statistics (always based on visible reviews only)
    const stats = await this.calculateListingRating(listingId);

    // Minimum 3 reviews required to display rating publicly
    const MINIMUM_REVIEWS_THRESHOLD = 3;
    const hasMinimumReviews = stats.reviewCount >= MINIMUM_REVIEWS_THRESHOLD;

    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit),
      averageRating: hasMinimumReviews ? stats.rating : 0,
      reviewCount: stats.reviewCount,
      distribution: stats.distribution,
      hasMinimumReviews: hasMinimumReviews,
      minimumRequired: MINIMUM_REVIEWS_THRESHOLD,
      message: hasMinimumReviews ? null : 'Not enough reviews to display rating'
    };
  }

  /**
   * Calculate average rating for a listing
   * @param {string} listingId - Listing ID
   * @returns {Promise<Object>} Rating statistics
   */
  async calculateListingRating(listingId) {
    // Get all visible reviews for this listing
    const reviews = await Review.find({
      listingId,
      status: 'visible'
    }).select('rating');

    // Calculate statistics
    const reviewCount = reviews.length;
    
    if (reviewCount === 0) {
      // No reviews - reset listing rating
      await Listing.findByIdAndUpdate(listingId, {
        rating: 0,
        reviewCount: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });

      return {
        rating: 0,
        reviewCount: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };
    }

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviewCount;

    // Calculate rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      distribution[review.rating] = (distribution[review.rating] || 0) + 1;
    });

    // Update listing
    await Listing.findByIdAndUpdate(listingId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      reviewCount,
      ratingDistribution: distribution
    });

    return {
      rating: Math.round(averageRating * 10) / 10,
      reviewCount,
      distribution
    };
  }

  /**
   * Validate review data
   * @private
   * @param {Object} reviewData - Review data to validate
   * @throws {Error} If validation fails
   */
  _validateReviewData(reviewData) {
    const { rating, comment } = reviewData;

    // Validate rating
    if (rating === undefined || rating === null) {
      throw new Error('Rating is required');
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be an integer between 1 and 5');
    }

    // Validate comment
    if (!comment || typeof comment !== 'string') {
      throw new Error('Comment is required');
    }

    const trimmedComment = comment.trim();
    if (trimmedComment.length < 10) {
      throw new Error('Comment must be at least 10 characters');
    }

    if (trimmedComment.length > 500) {
      throw new Error('Comment must not exceed 500 characters');
    }
  }
}

module.exports = new ReviewService();
