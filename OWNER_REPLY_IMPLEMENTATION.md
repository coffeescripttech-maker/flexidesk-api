# Owner Reply Implementation

## Overview

The Owner Reply feature allows workspace owners to respond to reviews left by clients. This implementation includes:

1. **OwnerReplyService** - Service layer for managing owner replies
2. **API Endpoints** - RESTful endpoints for creating and updating replies
3. **Email Notifications** - Automatic notifications to clients when owners reply
4. **Validation** - Character limits, authorization checks, and edit windows

## Features Implemented

### ✅ Task 12.1: OwnerReplyService Class

**File**: `src/services/OwnerReplyService.js`

**Methods**:
- `createReply(reviewId, ownerId, replyText)` - Create a new reply
- `updateReply(reviewId, ownerId, replyText)` - Update existing reply (within 24 hours)
- `canReply(reviewId, ownerId)` - Check if owner can reply to a review
- `getOwnerReviews(ownerId, options)` - Get reviews for owner's listings with filtering
- `_calculateOwnerStats(ownerId)` - Calculate reply statistics
- `_validateReplyText(replyText)` - Validate reply content

### ✅ Task 12.2: Reply Validation

**Validation Rules**:
- ✅ Owner must own the listing associated with the review
- ✅ Reply text must be 5-300 characters
- ✅ Replies can only be edited within 24 hours of creation
- ✅ Only one reply per review
- ✅ Reply text cannot be empty

### ✅ Task 12.3: Reply API Endpoints

**Endpoints**:

#### 1. Create Reply
```
POST /api/reviews/:id/reply
Authorization: Bearer <token>
Body: { text: "Reply text here" }
```

**Response**:
```json
{
  "message": "Reply added successfully.",
  "review": {
    "_id": "review_id",
    "ownerReply": {
      "text": "Reply text here",
      "createdAt": "2026-01-28T00:00:00.000Z",
      "updatedAt": "2026-01-28T00:00:00.000Z",
      "isEdited": false
    }
  }
}
```

#### 2. Update Reply
```
PUT /api/reviews/:id/reply
Authorization: Bearer <token>
Body: { text: "Updated reply text" }
```

**Response**:
```json
{
  "message": "Reply updated successfully.",
  "review": {
    "_id": "review_id",
    "ownerReply": {
      "text": "Updated reply text",
      "createdAt": "2026-01-28T00:00:00.000Z",
      "updatedAt": "2026-01-28T00:01:00.000Z",
      "isEdited": true
    }
  }
}
```

#### 3. Get Owner Reviews
```
GET /api/reviews/owner/my-reviews
Authorization: Bearer <token>
Query Parameters:
  - listingId: Filter by specific listing (optional)
  - status: Filter by status (default: 'visible')
  - hasReply: Filter by reply status (true/false, optional)
  - page: Page number (default: 1)
  - limit: Results per page (default: 20, max: 50)
  - sort: Sort order (recent/oldest/highest/lowest, default: recent)
```

**Response**:
```json
{
  "reviews": [...],
  "total": 10,
  "page": 1,
  "pages": 1,
  "stats": {
    "totalReviews": 10,
    "reviewsWithReply": 8,
    "reviewsWithoutReply": 2,
    "replyRate": 80,
    "averageRating": 4.5
  }
}
```

## Email Notifications

**Template**: `sendOwnerReplyNotificationEmail`

**Triggered**: When owner creates a reply to a review

**Sent To**: Client who wrote the review

**Email Content**:
- Client's original review with rating
- Owner's response
- Link to view full conversation (future enhancement)

## Data Model

The `ownerReply` field is embedded in the Review model:

```javascript
ownerReply: {
  text: { type: String, maxlength: 300 },
  createdAt: { type: Date },
  updatedAt: { type: Date },
  isEdited: { type: Boolean, default: false }
}
```

## Testing

### Service Tests
Run: `node test-owner-reply-service.js`

Tests:
- ✅ Authorization checks (owner vs non-owner)
- ✅ Create reply
- ✅ Update reply
- ✅ Validation (character limits)
- ✅ 24-hour edit window
- ✅ Get owner reviews with filtering
- ✅ Calculate reply statistics

### API Tests
Run: `node test-owner-reply-api.js`

Tests:
- ✅ POST /api/reviews/:id/reply
- ✅ PUT /api/reviews/:id/reply
- ✅ GET /api/reviews/owner/my-reviews
- ✅ Validation errors
- ✅ Filtering by reply status

## Error Handling

**Common Errors**:

| Error | Status | Message |
|-------|--------|---------|
| Unauthorized | 401 | "Unauthorized." |
| Not owner | 400 | "You can only reply to reviews for your own listings" |
| Reply exists | 400 | "Reply already exists. Use updateReply to modify it." |
| No reply | 400 | "No reply exists. Use createReply to add one." |
| Edit window expired | 400 | "Replies can only be edited within 24 hours of creation." |
| Text too short | 400 | "Reply text must be at least 5 characters" |
| Text too long | 400 | "Reply text must not exceed 300 characters" |
| Empty text | 400 | "Reply text cannot be empty" |

## Usage Examples

### Frontend Integration

```javascript
// Create reply
const createReply = async (reviewId, replyText) => {
  try {
    const response = await axios.post(
      `/api/reviews/${reviewId}/reply`,
      { text: replyText },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Reply created:', response.data);
  } catch (error) {
    console.error('Error:', error.response.data.message);
  }
};

// Update reply
const updateReply = async (reviewId, newText) => {
  try {
    const response = await axios.put(
      `/api/reviews/${reviewId}/reply`,
      { text: newText },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Reply updated:', response.data);
  } catch (error) {
    console.error('Error:', error.response.data.message);
  }
};

// Get owner reviews
const getOwnerReviews = async (filters = {}) => {
  try {
    const response = await axios.get('/api/reviews/owner/my-reviews', {
      headers: { Authorization: `Bearer ${token}` },
      params: filters
    });
    console.log('Reviews:', response.data);
  } catch (error) {
    console.error('Error:', error.response.data.message);
  }
};
```

## Next Steps

### Frontend UI Components (Task 13)
- [ ] Create OwnerReviewDashboard component
- [ ] Create ReplyModal component
- [ ] Display owner replies in review cards
- [ ] Add "Reply" button for reviews without replies
- [ ] Add "Edit Reply" button (within 24 hours)

### Future Enhancements
- [ ] In-app notifications for clients
- [ ] Reply templates for common responses
- [ ] Bulk reply actions
- [ ] Reply analytics (response time, sentiment)
- [ ] Reply moderation (admin review)

## Files Modified

1. **New Files**:
   - `src/services/OwnerReplyService.js` - Service layer
   - `test-owner-reply-service.js` - Service tests
   - `test-owner-reply-api.js` - API tests
   - `OWNER_REPLY_IMPLEMENTATION.md` - This documentation

2. **Modified Files**:
   - `src/controllers/reviews.controller.js` - Added reply endpoints
   - `src/routes/reviews.routes.js` - Added reply routes
   - `src/services/NotificationService.js` - Added reply notification
   - `src/utils/mailer.js` - Added reply email template

## Dependencies

No new dependencies required. Uses existing:
- mongoose (database)
- express (API)
- nodemailer (email)

## Configuration

No additional configuration required. Uses existing:
- MongoDB connection
- SMTP settings for email
- JWT authentication

---

**Implementation Date**: January 28, 2026  
**Status**: ✅ Complete  
**Next Task**: Task 13 - Build Owner Reply UI
