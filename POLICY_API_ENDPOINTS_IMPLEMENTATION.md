# Owner Policy API Endpoints Implementation

## Overview

This document describes the implementation of Task 6: Owner Policy API Endpoints for the Cancellation and Refund Management feature.

## Completed Subtasks

### ✅ 6.1 Create Policy Management Endpoints

Created three API endpoints for managing cancellation policies:

1. **GET /api/owner/cancellation-policies/templates**
   - Returns predefined policy templates (flexible, moderate, strict, none)
   - No authentication required (uses requireUser middleware)
   - Response: `{ templates: {...} }`

2. **GET /api/owner/listings/:id/cancellation-policy**
   - Gets the cancellation policy for a specific listing
   - Verifies listing ownership
   - Returns default moderate policy if none set
   - Response: `{ policy: {...} }`

3. **PUT /api/owner/listings/:id/cancellation-policy**
   - Sets or updates the cancellation policy for a listing
   - Validates policy data using middleware
   - Verifies listing ownership
   - Tracks policy changes with timestamps
   - Response: `{ policy: {...}, message: "..." }`

### ✅ 6.2 Add Policy Validation Middleware

Created `validateCancellationPolicy` middleware that validates:

- **Policy Structure**: Ensures policy data is a valid object
- **Tier Ordering**: Verifies tiers are ordered by hoursBeforeBooking in descending order
- **Refund Percentages**: Validates all percentages are between 0-100
- **Processing Fee**: Validates processing fee is between 0-100
- **Duplicate Detection**: Checks for duplicate tier hours
- **Non-negative Hours**: Ensures all hours are >= 0
- **Tier Consistency**: Validates refund percentages are non-increasing (earlier cancellations get higher refunds)

The middleware returns detailed error messages for validation failures.

### ✅ 6.3 Implement Policy Storage

Policy storage is handled by the PolicyManager service:

- **Save to Listing**: Policies are embedded in the Listing document's `cancellationPolicy` field
- **Update Existing**: The `setPolicy` method updates existing policies
- **Track Changes**: Maintains `createdAt` and `updatedAt` timestamps
- **Validation**: All policies are validated before storage
- **Default Policy**: Returns moderate policy if none is set

## Files Created/Modified

### New Files

1. **src/owners/routes/cancellation-policies.routes.js**
   - Route handler for policy templates endpoint

2. **src/middleware/validateCancellationPolicy.js**
   - Middleware for comprehensive policy validation

3. **test-policy-api-endpoints.js**
   - Comprehensive test suite for all endpoints

4. **POLICY_API_ENDPOINTS_IMPLEMENTATION.md** (this file)
   - Implementation documentation

### Modified Files

1. **src/owners/controllers/owner.listings.controller.js**
   - Added `getPolicyTemplates()` method
   - Added `getCancellationPolicy()` method
   - Added `setCancellationPolicy()` method

2. **src/owners/routes/listings.routes.js**
   - Added policy endpoints to listings routes
   - Integrated validation middleware

3. **src/owners/index.js**
   - Registered cancellation-policies routes

## API Endpoint Details

### 1. Get Policy Templates

```http
GET /api/owner/cancellation-policies/templates
Authorization: Bearer <token>
```

**Response:**
```json
{
  "templates": {
    "flexible": {
      "type": "flexible",
      "allowCancellation": true,
      "automaticRefund": true,
      "tiers": [
        {
          "hoursBeforeBooking": 24,
          "refundPercentage": 100,
          "description": "Full refund if cancelled 24+ hours before"
        },
        {
          "hoursBeforeBooking": 0,
          "refundPercentage": 0,
          "description": "No refund if cancelled less than 24 hours before"
        }
      ],
      "processingFeePercentage": 0,
      "customNotes": "Flexible cancellation policy - Full refund with 24 hours notice"
    },
    "moderate": { ... },
    "strict": { ... },
    "none": { ... }
  }
}
```

### 2. Get Listing Policy

```http
GET /api/owner/listings/:id/cancellation-policy
Authorization: Bearer <token>
```

**Response:**
```json
{
  "policy": {
    "type": "moderate",
    "allowCancellation": true,
    "automaticRefund": true,
    "tiers": [...],
    "processingFeePercentage": 5,
    "customNotes": "...",
    "createdAt": "2026-01-27T00:00:00.000Z",
    "updatedAt": "2026-01-27T00:00:00.000Z"
  }
}
```

### 3. Set/Update Listing Policy

```http
PUT /api/owner/listings/:id/cancellation-policy
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "custom",
  "allowCancellation": true,
  "automaticRefund": true,
  "tiers": [
    {
      "hoursBeforeBooking": 72,
      "refundPercentage": 100,
      "description": "Full refund (3+ days)"
    },
    {
      "hoursBeforeBooking": 24,
      "refundPercentage": 75,
      "description": "75% refund (1-3 days)"
    },
    {
      "hoursBeforeBooking": 0,
      "refundPercentage": 25,
      "description": "25% refund (<1 day)"
    }
  ],
  "processingFeePercentage": 3,
  "customNotes": "Custom policy with 3 tiers"
}
```

**Success Response:**
```json
{
  "policy": { ... },
  "message": "Cancellation policy updated successfully"
}
```

**Error Response (Validation Failed):**
```json
{
  "message": "Policy validation failed",
  "errors": [
    "Invalid refund percentage: 150% (must be 0-100)",
    "Duplicate tier at 24 hours"
  ]
}
```

## Validation Rules

### Policy Structure
- Policy must be an object
- Type must be one of: flexible, moderate, strict, custom, none
- If allowCancellation is false, tier validation is skipped

### Tier Validation
- Hours must be non-negative
- Refund percentages must be 0-100
- No duplicate hours allowed
- Tiers must be ordered by hours (descending)
- Refund percentages should be non-increasing (earlier = higher refund)
- Each tier must have a description

### Processing Fee
- Must be between 0-100

## Testing

Run the test suite:

```bash
cd flexidesk-api-master
node test-policy-api-endpoints.js
```

### Test Coverage

The test suite validates:

1. ✅ Policy template retrieval
2. ✅ Test listing creation
3. ✅ Setting flexible policy
4. ✅ Getting cancellation policy
5. ✅ Updating to moderate policy
6. ✅ Setting custom policy
7. ✅ Invalid policy rejection
8. ✅ Tier ordering validation
9. ✅ Policy persistence in database

All tests passed successfully!

## Integration with Frontend

The frontend CancellationPolicySection component can now:

1. Fetch policy templates from `/api/owner/cancellation-policies/templates`
2. Load existing policy from `/api/owner/listings/:id/cancellation-policy`
3. Save/update policy to `/api/owner/listings/:id/cancellation-policy`

The validation middleware ensures all policy data is valid before storage.

## Security

- All endpoints require authentication (requireUser middleware)
- Listing ownership is verified before policy operations
- Validation prevents invalid policy configurations
- Detailed error messages help owners fix issues

## Next Steps

Task 6 is now complete. The next tasks in the implementation plan are:

- Task 7: Display Policy to Clients
- Task 8: Checkpoint - Ensure policy setup and display work
- Task 9: Implement Cancellation Request Service

## Requirements Validated

This implementation satisfies:

- ✅ Requirement 1.1: Workspace cancellation policy settings
- ✅ Requirement 2.1: Predefined policy types
- ✅ Requirement 3.5: Policy validation

---

**Implementation Date**: January 27, 2026  
**Status**: Complete ✅  
**Test Results**: All tests passed ✅
