// src/models/RefundTransaction.js
const mongoose = require("mongoose");

const RefundTransactionSchema = new mongoose.Schema({
  cancellationRequestId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CancellationRequest', 
    required: true,
    index: true
  },
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true 
  },
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Transaction details
  amount: { type: Number, required: true },
  currency: { type: String, default: 'PHP' },
  paymentMethod: { type: String, required: true },
  originalTransactionId: { type: String, required: true },
  refundTransactionId: { type: String },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Gateway details
  gatewayProvider: { type: String, required: true },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  gatewayError: { type: String },
  
  // Timing
  initiatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  failedAt: { type: Date },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient queries
RefundTransactionSchema.index({ status: 1, initiatedAt: -1 });
RefundTransactionSchema.index({ clientId: 1, status: 1 });

module.exports = mongoose.model("RefundTransaction", RefundTransactionSchema);
