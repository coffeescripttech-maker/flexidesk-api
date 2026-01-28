const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true, // One review per booking
      index: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },

    // Photo uploads (up to 5 photos) - Cloudinary URLs
    photos: [{ 
      type: String,
      maxlength: 5
    }],

    // Legacy images field for backward compatibility
    images: [
      {
        url: String,
        key: String, // Cloudinary public_id or S3 key
      },
    ],

    // Status and moderation
    status: {
      type: String,
      enum: ["visible", "hidden", "flagged", "deleted"],
      default: "visible",
      index: true,
    },

    flagReason: {
      type: String,
    },

    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    flaggedAt: {
      type: Date,
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    moderatedAt: {
      type: Date,
    },

    moderationNotes: {
      type: String,
    },

    // Edit tracking
    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },

    // Owner reply
    ownerReply: {
      text: { 
        type: String, 
        maxlength: 300 
      },
      createdAt: { 
        type: Date 
      },
      updatedAt: { 
        type: Date 
      },
      isEdited: { 
        type: Boolean, 
        default: false 
      },
    },
  },
  {
    timestamps: true,
  }
);

/* Prevent multi-review abuse:
   One user should only review a specific booking once */
ReviewSchema.index({ userId: 1, bookingId: 1 }, { unique: true });

// Compound indexes for efficient queries
ReviewSchema.index({ listingId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });
ReviewSchema.index({ ownerId: 1, status: 1 });
ReviewSchema.index({ status: 1, flaggedAt: -1 });

// Virtual for edit eligibility (within 24 hours)
ReviewSchema.virtual('canEdit').get(function() {
  const hoursSinceCreation = (Date.now() - this.createdAt) / (1000 * 60 * 60);
  return hoursSinceCreation < 24;
});

module.exports = mongoose.model("Review", ReviewSchema);
