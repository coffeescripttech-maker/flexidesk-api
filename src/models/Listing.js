// models/Listing.js
const { Schema, model, Types } = require("mongoose");

const Money = { type: Number, default: 0 };

// Cancellation Policy Schema
const CancellationPolicySchema = new Schema({
  type: { 
    type: String, 
    enum: ['flexible', 'moderate', 'strict', 'custom', 'none'],
    default: 'moderate'
  },
  allowCancellation: { type: Boolean, default: true },
  automaticRefund: { type: Boolean, default: false },
  tiers: [{
    hoursBeforeBooking: { type: Number, required: true },
    refundPercentage: { type: Number, min: 0, max: 100, required: true },
    description: { type: String, required: true }
  }],
  processingFeePercentage: { type: Number, min: 0, max: 100, default: 0 },
  customNotes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const ListingSchema = new Schema(
  {
    owner: { type: Types.ObjectId, ref: "User", required: true, index: true },

    category: String,
    scope: String,
    venue: String,

    address: String,
    address2: String,
    district: String,
    city: String,
    region: String,
    zip: String,
    country: String,
    lat: String,
    lng: String,
    showApprox: { type: Boolean, default: false },

    seats: { type: Number, default: 0 },
    rooms: { type: Number, default: 0 },
    privateRooms: { type: Number, default: 0 },
    minHours: { type: Number, default: 0 },
    hasLocks: { type: Boolean, default: false },

    shortDesc: String,
    longDesc: String,
    wifiMbps: String,
    outletsPerSeat: String,
    noiseLevel: String,

    currency: { type: String, default: "PHP" },
    priceSeatDay: Money,
    priceSeatHour: Money,
    priceRoomHour: Money,
    priceRoomDay: Money,
    priceWholeDay: Money,
    priceWholeMonth: Money,
    serviceFee: Money,
    cleaningFee: Money,

    amenities: { type: Schema.Types.Mixed, default: {} },
    accessibility: { type: Schema.Types.Mixed, default: {} },
    parking: { type: String, default: "none" },

    // Demographic fields for better matching
    idealFor: { 
      type: [String], 
      default: [],
      enum: ['freelancers', 'students', 'startups', 'small-business', 
             'enterprise', 'remote-teams', 'creative', 'tech', 
             'consultants', 'educators', 'general']
    },
    workStyle: { 
      type: [String], 
      default: [],
      enum: ['focused', 'collaborative', 'networking', 'flexible', 
             'creative', 'meetings', 'social']
    },
    industries: { 
      type: [String], 
      default: []
    },

    photosMeta: { type: Array, default: [] },
    coverIndex: { type: Number, default: 0 },

    customMessage: { type: String, default: "" },
    guestNotes: { type: String, default: "" },
    openingHoursWeekdays: { type: String, default: "" },
    openingHoursWeekends: { type: String, default: "" },
    checkinInstructions: { type: String, default: "" },
    otherRules: { type: String, default: "" },

    status: { type: String, enum: ["draft", "active", "archived"], default: "draft", index: true },
    isFeatured: { type: Boolean, default: false, index: true },

    // Review and rating fields
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    ratingDistribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },

    // Cancellation Policy
    cancellationPolicy: CancellationPolicySchema,
  },
  { timestamps: true }
);

module.exports = model("Listing", ListingSchema);
