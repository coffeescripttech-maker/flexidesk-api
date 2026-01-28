# Client Cancellation API Implementation

## Overview

This document describes the implementation of client-facing cancellation and refund API endpoints for the FlexiDesk platform. The implementation allows clients to request booking cancellations, calculate refunds, and track their cancellation requests.

## Implementation Date

January 27, 2026

## Files Created/Modified

### New Files

1. **src/controllers/cancellations.controller.js**
   - Controller for client cancellation endpoints
   - Handles refund calculations and cancellation requests
   - Implements validation and error handling

2. **src/routes/cancellations.routes.js**
   - Routes for cancellation endpoints
   - Integrates with authentication middleware

3. **test-client-cancellation-api.js**
   - Comprehensive test suite for cancellation API
   - Tests all endpoints and validation logic

### Modified Files

1. **server.js**
   - Added cancellations routes registration

2. **src/utils/mailer.js**
   - Added `sendCancellationConfirmationEmail()` function
   - Added `sendRefundRequestNotificationEmail()` function

3. **src/services/CancellationRequestService.js**
   - Added `_sendCancellationNotifications()` method
   - Integrated email notifications into request creation

## API Endpoints

### 1. GET /api/listings/:id/cancellation-policy

**Description**: Get cancellation policy for a listing

**Authentication**: Not required (public endpoint)

**Response**:
```json
{
  "policy": {
    "type": "moderate",
    "allowCancellation": true,
    "automaticRefund": true,
    "tiers": [
      {
        "hoursBeforeBooking": 168,
        "refundPercentage": 100,
        "description": "Full refund (7+ days)"
      },
      {
        "hoursBeforeBooking": 48,
        "refundPercentage": 50,
        "description": "50% refund (2-7 days)"
      },
      {
        "hoursBeforeBooking": 0,
        "refundPercentage": 0,
        "description": "No refund (<2 days)"
      }
    ],
    "processingFeePercentage": 5
  }
}
```

**Status**: Already implemented in listings.controller.js

---

### 2. POST /api/bookings/:id/calculate-refund

**Description**: Calculate refund amount for a potential cancellation

**Authentication**: Required (client must own the booking)

**Request**: No body required

**Response**:
```json
{
  "calculation": {
    "originalAmount": 1000,
    "refundPercentage": 100,
    "refundAmount": 1000,
    "processingFee": 50,
    "finalRefund": 950,
    "hoursUntilBooking": 168.5,
    "tier": {
      "hoursBeforeBooking": 168,
      "refundPercentage": 100,
      "description": "Full refund (7+ days)"
    }
  },
  "policy": {
    "type": "moderate",
    "allowCancellation": true,
    "automaticRefund": true
  }
}
```

**Error Responses**:
- 401: Unauthorized (not logged in)
- 403: Forbidden (booking doesn't belong to user)
- 404: Booking not found
- 400: Cancellation not allowed for this workspace

---

### 3. POST /api/bookings/:id/cancel

**Description**: Request cancellation for a booking

**Authentication**: Required (client must own the booking)

**Request Body**:
```json
{
  "reason": "schedule_change",
  "reasonOther": null
}
```

**Valid Reasons**:
- `schedule_change`: Schedule changed
- `found_alternative`: Found alternative workspace
- `emergency`: Emergency situation
- `other`: Other reason (requires `reasonOther` field)

**Response**:
```json
{
  "message": "Cancellation request created successfully",
  "cancellationRequest": {
    "_id": "507f1f77bcf86cd799439011",
    "bookingId": "507f1f77bcf86cd799439012",
    "clientId": "507f1f77bcf86cd799439013",
    "ownerId": "507f1f77bcf86cd799439014",
    "listingId": "507f1f77bcf86cd799439015",
    "status": "pending",
    "isAutomatic": false,
    "cancellationReason": "schedule_change",
    "requestedAt": "2026-01-27T10:00:00.000Z",
    "refundCalculation": {
      "originalAmount": 1000,
      "refundPercentage": 50,
      "refundAmount": 500,
      "processingFee": 25,
      "finalRefund": 475,
      "hoursUntilBooking": 164.5
    }
  },
  "refundCalculation": {
    "originalAmount": 1000,
    "refundPercentage": 50,
    "refundAmount": 500,
    "processingFee": 25,
    "finalRefund": 475,
    "hoursUntilBooking": 164.5
  },
  "booking": {
    "_id": "507f1f77bcf86cd799439012",
    "startDate": "2026-02-03",
    "endDate": "2026-02-04",
    "amount": 1000,
    "listing": {
      "_id": "507f1f77bcf86cd799439015",
      "title": "Modern Office Space",
      "venue": "Business Center"
    }
  }
}
```

**Error Responses**:
- 401: Unauthorized (not logged in)
- 403: Forbidden (booking doesn't belong to user)
- 404: Booking not found
- 400: Invalid reason, booking already cancelled, booking already started, duplicate request, etc.

**Notifications Sent**:
1. **To Client**: Cancellation confirmation email with refund details
2. **To Owner**: Refund request notification (unless automatic refund)

---

### 4. GET /api/client/cancellations

**Description**: Get all cancellation requests for the current client

**Authentication**: Required

**Query Parameters**:
- `status` (optional): Filter by status (pending, approved, rejected, processing, completed, failed)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response**:
```json
{
  "requests": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "bookingId": {
        "_id": "507f1f77bcf86cd799439012",
        "startDate": "2026-02-03",
        "endDate": "2026-02-04",
        "amount": 1000
      },
      "listingId": {
        "_id": "507f1f77bcf86cd799439015",
        "title": "Modern Office Space",
        "venue": "Business Center",
        "city": "Manila"
      },
      "status": "pending",
      "isAutomatic": false,
      "cancellationReason": "schedule_change",
      "requestedAt": "2026-01-27T10:00:00.000Z",
      "refundCalculation": {
        "finalRefund": 475
      }
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

---

### 5. GET /api/client/cancellations/:id

**Description**: Get a single cancellation request with full details

**Authentication**: Required (client must own the request)

**Response**:
```json
{
  "request": {
    "_id": "507f1f77bcf86cd799439011",
    "bookingId": {
      "_id": "507f1f77bcf86cd799439012",
      "startDate": "2026-02-03",
      "endDate": "2026-02-04",
      "amount": 1000,
      "checkInTime": "09:00",
      "checkOutTime": "17:00"
    },
    "listingId": {
      "_id": "507f1f77bcf86cd799439015",
      "title": "Modern Office Space",
      "venue": "Business Center",
      "city": "Manila",
      "address": "123 Business St, Makati"
    },
    "ownerId": {
      "_id": "507f1f77bcf86cd799439014",
      "fullName": "John Owner",
      "email": "owner@example.com"
    },
    "status": "pending",
    "isAutomatic": false,
    "cancellationReason": "schedule_change",
    "requestedAt": "2026-01-27T10:00:00.000Z",
    "refundCalculation": {
      "originalAmount": 1000,
      "refundPercentage": 50,
      "refundAmount": 500,
      "processingFee": 25,
      "finalRefund": 475,
      "hoursUntilBooking": 164.5,
      "appliedTier": {
        "hoursBeforeBooking": 48,
        "refundPercentage": 50,
        "description": "50% refund (2-7 days)"
      }
    }
  },
  "booking": { /* same as bookingId above */ },
  "listing": { /* same as listingId above */ }
}
```

**Error Responses**:
- 401: Unauthorized (not logged in)
- 403: Forbidden (request doesn't belong to user)
- 404: Cancellation request not found

---

## Business Logic

### Refund Calculation

The refund calculation follows these steps:

1. **Get Cancellation Policy**: Retrieve the listing's cancellation policy
2. **Calculate Hours Until Booking**: Determine time between now and booking start
3. **Find Applicable Tier**: Match hours to the appropriate policy tier
4. **Calculate Refund Amount**: Apply refund percentage to booking amount
5. **Apply Processing Fee**: Deduct processing fee from refund amount
6. **Return Final Refund**: Return the net refund amount

**Formula**:
```
hoursUntilBooking = (bookingStartDate - currentDate) / (1000 * 60 * 60)
refundAmount = bookingAmount * (tierRefundPercentage / 100)
processingFee = refundAmount * (policyProcessingFeePercentage / 100)
finalRefund = refundAmount - processingFee
```

### Automatic Refund Eligibility

A cancellation request is eligible for automatic refund if ALL of the following are true:

1. Policy allows automatic refunds (`policy.automaticRefund === true`)
2. Refund percentage is 100% (`refundPercentage === 100`)
3. Cancellation is more than 24 hours before booking (`hoursUntilBooking >= 24`)

### Validation Rules

**Booking Validation**:
- Booking must exist
- Booking must belong to the requesting client
- Booking must not be already cancelled
- Booking must not be completed
- Booking must not have already started
- No duplicate cancellation request exists

**Reason Validation**:
- Reason must be one of: `schedule_change`, `found_alternative`, `emergency`, `other`
- If reason is `other`, `reasonOther` field is required

**Policy Validation**:
- Listing must have a cancellation policy
- Policy must allow cancellations (`allowCancellation === true`)

---

## Email Notifications

### Client Cancellation Confirmation

**Sent To**: Client who requested cancellation

**Subject**: "Booking Cancellation Confirmed - FlexiDesk"

**Content**:
- Booking details (space, location, date, amount)
- Refund breakdown (percentage, amount, fees, final refund)
- Status (automatic or pending owner approval)
- Expected refund timeline

### Owner Refund Request Notification

**Sent To**: Workspace owner

**Subject**: "New Refund Request - [Workspace Name]"

**Content**:
- Client information
- Booking details
- Refund amount
- Cancellation reason
- Link to review request in dashboard

**Note**: This email is NOT sent for automatic refunds.

---

## Testing

### Test Coverage

The test suite (`test-client-cancellation-api.js`) covers:

1. ✅ Test data creation (users, listings, bookings)
2. ✅ Refund calculation with different timing scenarios
3. ✅ Cancellation request creation
4. ✅ Request retrieval and population
5. ✅ Custom reason handling ("other" reason)
6. ✅ Duplicate request validation
7. ✅ Past booking validation
8. ✅ Owner requests retrieval
9. ✅ Automatic refund eligibility
10. ✅ Cancellation reasons analytics

### Running Tests

```bash
cd flexidesk-api-master
node test-client-cancellation-api.js
```

### Test Results

All tests passed successfully:
- ✅ Refund calculation: Working
- ✅ Cancellation request creation: Working
- ✅ Validation: Working
- ✅ Reason tracking: Working
- ✅ Owner requests retrieval: Working
- ✅ Automatic refund eligibility: Working
- ✅ Analytics: Working

---

## Integration Points

### Existing Services Used

1. **CancellationRequestService**: Core service for managing cancellation requests
2. **RefundCalculator**: Calculates refund amounts based on policy and timing
3. **PolicyManager**: Retrieves cancellation policies for listings
4. **Mailer**: Sends email notifications

### Database Models Used

1. **Booking**: Booking information
2. **Listing**: Workspace and policy information
3. **User**: Client and owner information
4. **CancellationRequest**: Cancellation request tracking

---

## Security Considerations

### Authentication

- All endpoints (except policy retrieval) require authentication
- JWT token validation via `requireAuth` middleware

### Authorization

- Clients can only cancel their own bookings
- Clients can only view their own cancellation requests
- Booking ownership verified before any operation

### Data Validation

- Input validation for all request parameters
- Enum validation for cancellation reasons
- Business logic validation (booking status, timing, etc.)

### Error Handling

- Sensitive information not exposed in error messages
- Detailed logging for debugging
- Graceful error handling with appropriate HTTP status codes

---

## Future Enhancements

### Phase 4: Owner Refund Management (Tasks 13-16)
- Owner refund dashboard
- Approve/reject workflows
- Payment gateway integration
- Refund transaction tracking

### Phase 5: Automation (Tasks 17-20)
- Automatic refund processing background job
- Refund status sync with payment gateway
- Failed refund retry logic
- Enhanced notification system

### Phase 6: Advanced Features (Tasks 21-24)
- Admin oversight and analytics
- Refund trend analysis
- Partial refund support
- Export functionality

---

## Troubleshooting

### Common Issues

**Issue**: "Cancellation request already exists"
- **Cause**: Duplicate cancellation request for the same booking
- **Solution**: Check existing requests before creating new one

**Issue**: "Cannot cancel a booking that has already started"
- **Cause**: Booking start date is in the past
- **Solution**: Contact workspace owner directly for assistance

**Issue**: "Cancellation is not allowed for this workspace"
- **Cause**: Listing has no cancellation policy or policy disallows cancellations
- **Solution**: Review listing's cancellation policy before booking

**Issue**: Email notifications not sent
- **Cause**: SMTP configuration issues or missing user email
- **Solution**: Check SMTP settings in .env file and verify user has email address

---

## API Usage Examples

### Example 1: Calculate Refund Before Cancelling

```javascript
// Client wants to see refund amount before cancelling
const response = await fetch('/api/bookings/507f1f77bcf86cd799439012/calculate-refund', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log('You will receive: ₱' + data.calculation.finalRefund);
```

### Example 2: Cancel Booking

```javascript
// Client decides to cancel
const response = await fetch('/api/bookings/507f1f77bcf86cd799439012/cancel', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'schedule_change',
    reasonOther: null
  })
});

const data = await response.json();
console.log('Cancellation request created:', data.cancellationRequest._id);
console.log('Status:', data.cancellationRequest.status);
console.log('Automatic:', data.cancellationRequest.isAutomatic);
```

### Example 3: View Cancellation Requests

```javascript
// Client views their cancellation history
const response = await fetch('/api/client/cancellations?status=pending&page=1&limit=10', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const data = await response.json();
console.log('Total requests:', data.total);
data.requests.forEach(req => {
  console.log(`${req.listingId.title}: ₱${req.refundCalculation.finalRefund} - ${req.status}`);
});
```

---

## Conclusion

The Client Cancellation API implementation provides a complete solution for clients to request booking cancellations and track refunds. The implementation includes:

- ✅ 5 API endpoints for cancellation management
- ✅ Comprehensive validation and error handling
- ✅ Email notifications for clients and owners
- ✅ Automatic refund eligibility detection
- ✅ Cancellation reason tracking for analytics
- ✅ Full test coverage

The implementation is ready for integration with the frontend and can be extended with owner refund management and payment gateway integration in future phases.

---

**Implementation Status**: ✅ Complete
**Task**: 11. Implement Client Cancellation API Endpoints
**Subtasks**: 11.1, 11.2, 11.3 - All Complete
**Next Steps**: Task 12 - Checkpoint, then Task 13 - Owner Refund Management Dashboard
