// src/models/CancellationRequest.js
const mongoose = require("mongoose");

const CancellationRequestSchema = new mongoose.Schema({
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true,
    index: true
  },
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  listingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Listing', 
    required: true 
  },
  
  // Request details
  requestedAt: { type: Date, default: Date.now, index: true },
  bookingStartDate: { type: Date, required: true },
  bookingEndDate: { type: Date, required: true },
  bookingAmount: { type: Number, required: true },
  
  // Refund calculation
  refundCalculation: {
    originalAmount: { type: Number, required: true },
    refundPercentage: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    processingFee: { type: Number, default: 0 },
    finalRefund: { type: Number, required: true },
    hoursUntilBooking: { type: Number, required: true },
    appliedTier: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Cancellation reason
  cancellationReason: { 
    type: String, 
    enum: ['schedule_change', 'found_alternative', 'emergency', 'other'],
    required: true 
  },
  cancellationReasonOther: { type: String },
  
  // Status and workflow
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  isAutomatic: { type: Boolean, default: false },
  
  // Approval/Rejection
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  
  // Custom refund
  customRefundAmount: { type: Number },
  customRefundNote: { type: String },
  
  // Processing
  processedAt: { type: Date },
  refundTransactionId: { type: String },
  paymentGatewayResponse: { type: mongoose.Schema.Types.Mixed },
  
  // Retry tracking
  retryCount: { type: Number, default: 0 },
  lastRetryAt: { type: Date },
  failureReason: { type: String },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound indexes for efficient queries
CancellationRequestSchema.index({ ownerId: 1, status: 1, requestedAt: -1 });
CancellationRequestSchema.index({ clientId: 1, requestedAt: -1 });
CancellationRequestSchema.index({ status: 1, isAutomatic: 1 });

module.exports = mongoose.model("CancellationRequest", CancellationRequestSchema);
