const Review = require("../../models/Review");
const Listing = require("../../models/Listing");
const User = require("../../models/User");
const NotificationService = require("../../services/NotificationService");
const ReviewService = require("../../services/ReviewService");

/**
 * Get flagged reviews for admin moderation
 * GET /api/admin/reviews/flagged
 */
exports.getFlaggedReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "flagged",
      reason,
      sort = "flaggedAt_desc",
      search,
    } = req.query;

    const query = {};

    // Filter by status
    if (status !== "all") {
      query.status = status;
    }

    // Filter by flag reason
    if (reason && reason !== "all") {
      query.flagReason = reason;
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, "i");
      
      // Find users matching search
      const users = await User.find({
        $or: [
          { email: searchRegex },
          { name: searchRegex },
        ],
      }).select("_id");
      const userIds = users.map((u) => u._id);

      // Find listings matching search
      const listings = await Listing.find({
        name: searchRegex,
      }).select("_id");
      const listingIds = listings.map((l) => l._id);

      query.$or = [
        { userId: { $in: userIds } },
        { listingId: { $in: listingIds } },
        { comment: searchRegex },
      ];
    }

    // Parse sort
    const [sortField, sortOrder] = sort.split("_");
    const sortObj = { [sortField]: sortOrder === "desc" ? -1 : 1 };

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find(query)
      .populate("userId", "name email")
      .populate("listingId", "name")
      .populate("flaggedBy", "email")
      .populate("moderatedBy", "email")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(query);
    const pages = Math.ceil(total / parseInt(limit));

    res.json({
      reviews,
      total,
      page: parseInt(page),
      pages,
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("[AdminReviews] Error fetching flagged reviews:", error);
    res.status(500).json({
      message: "Failed to fetch flagged reviews",
      error: error.message,
    });
  }
};

/**
 * Moderate a review (approve, hide, delete)
 * POST /api/admin/reviews/:id/moderate
 */
exports.moderateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    const adminId = req.user._id;

    // Validate action
    if (!["approve", "hide", "delete"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action. Must be 'approve', 'hide', or 'delete'",
      });
    }

    // Validate notes for hide and delete actions
    if ((action === "hide" || action === "delete") && !notes?.trim()) {
      return res.status(400).json({
        message: `Notes are required for ${action} action`,
      });
    }

    // Find the review
    const review = await Review.findById(id)
      .populate("userId", "name email")
      .populate("listingId", "name ownerId")
      .populate("flaggedBy", "email");

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    let updatedReview;

    switch (action) {
      case "approve":
        // Set status to visible
        review.status = "visible";
        review.moderatedBy = adminId;
        review.moderatedAt = new Date();
        review.moderationNotes = notes || "Approved by admin";
        updatedReview = await review.save();

        // Recalculate listing rating
        await ReviewService.calculateListingRating(review.listingId._id);

        // Notify the user who flagged (if applicable)
        if (review.flaggedBy && review.flaggedBy._id) {
          await NotificationService.notifyFlagResolution(
            review.flaggedBy._id,
            review,
            "approved"
          );
        }
        break;

      case "hide":
        // Set status to hidden
        review.status = "hidden";
        review.moderatedBy = adminId;
        review.moderatedAt = new Date();
        review.moderationNotes = notes;
        updatedReview = await review.save();

        // Recalculate listing rating (hidden reviews don't count)
        await ReviewService.calculateListingRating(review.listingId._id);

        // Notify the user who flagged
        if (review.flaggedBy && review.flaggedBy._id) {
          await NotificationService.notifyFlagResolution(
            review.flaggedBy._id,
            review,
            "hidden"
          );
        }

        // Notify the review author
        await NotificationService.notifyReviewHidden(review.userId._id, review, notes);
        break;

      case "delete":
        // Soft delete - set status to deleted
        review.status = "deleted";
        review.moderatedBy = adminId;
        review.moderatedAt = new Date();
        review.moderationNotes = notes;
        updatedReview = await review.save();

        // Recalculate listing rating (deleted reviews don't count)
        await ReviewService.calculateListingRating(review.listingId._id);

        // Notify the user who flagged
        if (review.flaggedBy && review.flaggedBy._id) {
          await NotificationService.notifyFlagResolution(
            review.flaggedBy._id,
            review,
            "deleted"
          );
        }

        // Notify the review author
        await NotificationService.notifyReviewDeleted(review.userId._id, review, notes);
        break;
    }

    res.json({
      message: `Review ${action}d successfully`,
      review: updatedReview,
    });
  } catch (error) {
    console.error("[AdminReviews] Error moderating review:", error);
    res.status(500).json({
      message: "Failed to moderate review",
      error: error.message,
    });
  }
};

/**
 * Get review analytics for admin dashboard
 * GET /api/admin/reviews/analytics
 */
exports.getReviewAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const query = {};
    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }

    // Total reviews count
    const totalReviews = await Review.countDocuments(query);

    // Reviews by status
    const reviewsByStatus = await Review.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = {
      visible: 0,
      hidden: 0,
      flagged: 0,
      deleted: 0,
    };
    reviewsByStatus.forEach((item) => {
      statusCounts[item._id] = item.count;
    });

    // Average rating across platform (visible reviews only)
    const ratingStats = await Review.aggregate([
      { $match: { ...query, status: "visible" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalVisible: { $sum: 1 },
        },
      },
    ]);

    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating : 0;
    const visibleReviews = ratingStats.length > 0 ? ratingStats[0].totalVisible : 0;

    // Flagged reviews count
    const flaggedCount = statusCounts.flagged;

    // Reviews by flag reason
    const flagReasons = await Review.aggregate([
      { $match: { ...query, status: "flagged" } },
      {
        $group: {
          _id: "$flagReason",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { ...query, status: "visible" } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingDistribution.forEach((item) => {
      distribution[item._id] = item.count;
    });

    // Moderation trends (reviews moderated per day for last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const moderationTrends = await Review.aggregate([
      {
        $match: {
          moderatedAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$moderatedAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Reviews with photos
    const reviewsWithPhotos = await Review.countDocuments({
      ...query,
      photos: { $exists: true, $ne: [] },
    });

    // Reviews with owner replies
    const reviewsWithReplies = await Review.countDocuments({
      ...query,
      "ownerReply.text": { $exists: true, $ne: null },
    });

    res.json({
      totalReviews,
      visibleReviews,
      averageRating: parseFloat(averageRating.toFixed(2)),
      flaggedCount,
      statusCounts,
      flagReasons,
      ratingDistribution: distribution,
      moderationTrends,
      reviewsWithPhotos,
      reviewsWithReplies,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  } catch (error) {
    console.error("[AdminReviews] Error fetching analytics:", error);
    res.status(500).json({
      message: "Failed to fetch review analytics",
      error: error.message,
    });
  }
};
