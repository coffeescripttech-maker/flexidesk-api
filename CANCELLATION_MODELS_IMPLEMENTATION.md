# Cancellation & Refund Models Implementation

## Overview

This document describes the implementation of core data models for the Cancellation and Refund Management feature.

## Implemented Models

### 1. CancellationPolicy Schema (Embedded in Listing)

**Location**: `src/models/Listing.js`

**Purpose**: Defines cancellation rules for each workspace listing.

**Schema Fields**:
- `type`: Policy type (flexible, moderate, strict, custom, none)
- `allowCancellation`: Boolean flag to enable/disable cancellations
- `automaticRefund`: Boolean flag for automatic refund processing
- `tiers`: Array of refund tiers with:
  - `hoursBeforeBooking`: Hours before booking when tier applies
  - `refundPercentage`: Percentage of refund (0-100)
  - `description`: Human-readable description
- `processingFeePercentage`: Processing fee percentage (0-100)
- `customNotes`: Optional custom notes from owner
- `createdAt`, `updatedAt`: Timestamps

**Example**:
```javascript
{
  type: 'flexible',
  allowCancellation: true,
  automaticRefund: true,
  tiers: [
    { hoursBeforeBooking: 24, refundPercentage: 100, description: 'Full refund' },
    { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund' }
  ],
  processingFeePercentage: 0
}
```

### 2. CancellationRequest Model

**Location**: `src/models/CancellationRequest.js`

**Purpose**: Tracks client cancellation requests and refund processing.

**Key Features**:
- Links to Booking, Client, Owner, and Listing
- Stores refund calculation details
- Tracks approval/rejection workflow
- Supports custom refund amounts
- Handles retry logic for failed refunds

**Indexes**:
- `bookingId`, `clientId`, `ownerId`, `requestedAt`, `status` (individual)
- Compound: `{ ownerId: 1, status: 1, requestedAt: -1 }`
- Compound: `{ clientId: 1, requestedAt: -1 }`
- Compound: `{ status: 1, isAutomatic: 1 }`

**Status Flow**:
```
pending → approved/rejected → processing → completed/failed
```

### 3. RefundTransaction Model

**Location**: `src/models/RefundTransaction.js`

**Purpose**: Tracks payment gateway refund transactions.

**Key Features**:
- Links to CancellationRequest and Booking
- Stores payment gateway details
- Tracks transaction status
- Records gateway responses and errors

**Indexes**:
- `cancellationRequestId`, `status` (individual)
- Compound: `{ status: 1, initiatedAt: -1 }`
- Compound: `{ clientId: 1, status: 1 }`

**Status Flow**:
```
pending → processing → completed/failed/cancelled
```

## Database Migration

**Script**: `migrations/add-cancellation-models.js`

**What it does**:
1. Creates indexes for CancellationRequest model
2. Creates indexes for RefundTransaction model
3. Updates Listing model with cancellationPolicy field
4. Verifies all models are working correctly

**How to run**:
```bash
cd flexidesk-api-master
node migrations/add-cancellation-models.js
```

**Output**:
- ✓ CancellationRequest indexes created
- ✓ RefundTransaction indexes created
- ✓ Listing model updated
- ✓ All models verified

## Testing

**Test Script**: `test-cancellation-models.js`

**What it tests**:
1. CancellationPolicy schema in Listing model
2. CancellationRequest model validation
3. RefundTransaction model validation
4. Index creation verification

**How to run**:
```bash
cd flexidesk-api-master
node test-cancellation-models.js
```

**Test Results**:
- ✓ All models validate correctly
- ✓ All indexes created (9 for CancellationRequest, 5 for RefundTransaction)
- ✓ Sample data can be saved and retrieved

## Verification

**Verification Script**: `verify-cancellation-policy.js`

**Purpose**: Verify that a listing has a cancellation policy.

**How to run**:
```bash
cd flexidesk-api-master
node verify-cancellation-policy.js
```

## Usage Examples

### Creating a Cancellation Request

```javascript
const CancellationRequest = require('./src/models/CancellationRequest');

const request = await CancellationRequest.create({
  bookingId: booking._id,
  clientId: client._id,
  ownerId: owner._id,
  listingId: listing._id,
  bookingStartDate: booking.startDate,
  bookingEndDate: booking.endDate,
  bookingAmount: booking.amount,
  refundCalculation: {
    originalAmount: 1000,
    refundPercentage: 100,
    refundAmount: 1000,
    processingFee: 0,
    finalRefund: 1000,
    hoursUntilBooking: 48
  },
  cancellationReason: 'schedule_change',
  status: 'pending'
});
```

### Setting a Cancellation Policy

```javascript
const Listing = require('./src/models/Listing');

const listing = await Listing.findById(listingId);
listing.cancellationPolicy = {
  type: 'moderate',
  allowCancellation: true,
  automaticRefund: true,
  tiers: [
    { hoursBeforeBooking: 168, refundPercentage: 100, description: 'Full refund (7+ days)' },
    { hoursBeforeBooking: 48, refundPercentage: 50, description: '50% refund (2-7 days)' },
    { hoursBeforeBooking: 0, refundPercentage: 0, description: 'No refund (<2 days)' }
  ],
  processingFeePercentage: 5
};
await listing.save();
```

### Creating a Refund Transaction

```javascript
const RefundTransaction = require('./src/models/RefundTransaction');

const transaction = await RefundTransaction.create({
  cancellationRequestId: request._id,
  bookingId: booking._id,
  clientId: client._id,
  ownerId: owner._id,
  amount: 1000,
  currency: 'PHP',
  paymentMethod: 'paymongo',
  originalTransactionId: booking.payment.checkoutId,
  status: 'pending',
  gatewayProvider: 'paymongo'
});
```

## Next Steps

With the core data models in place, the next tasks are:

1. **Task 2**: Implement Policy Manager Service
2. **Task 3**: Implement Refund Calculator Service
3. **Task 4**: Checkpoint - Ensure core services work correctly

## Requirements Validated

This implementation satisfies the following requirements:

- **Requirement 1.1**: Workspace cancellation policy settings (CancellationPolicy schema)
- **Requirement 4.1**: Client cancellation request (CancellationRequest model)
- **Requirement 13.1**: Payment gateway integration (RefundTransaction model)

## Files Created/Modified

### Created:
- `src/models/CancellationRequest.js` - New model
- `src/models/RefundTransaction.js` - New model
- `migrations/add-cancellation-models.js` - Migration script
- `test-cancellation-models.js` - Test script
- `verify-cancellation-policy.js` - Verification script
- `CANCELLATION_MODELS_IMPLEMENTATION.md` - This document

### Modified:
- `src/models/Listing.js` - Added CancellationPolicy schema

## Database Impact

- **New Collections**: 
  - `cancellationrequests` (0 documents initially)
  - `refundtransactions` (0 documents initially)
  
- **Modified Collections**:
  - `listings` (7 documents, now with cancellationPolicy field)

- **New Indexes**: 14 total
  - CancellationRequest: 9 indexes
  - RefundTransaction: 5 indexes

## Notes

- MongoDB is schema-less, so no traditional migrations are needed
- Indexes are created automatically when models are first used
- The migration script ensures indexes are created immediately
- Existing listings will have `cancellationPolicy: undefined` until explicitly set
- All models use Mongoose validation for data integrity

---

**Implementation Date**: January 26, 2026  
**Status**: ✅ Complete  
**Task**: 1. Set up core data models and infrastructure
