# Content Moderation Service Implementation

## Overview
Implemented a comprehensive Content Moderation Service for the User Reviews Feature that automatically detects and flags inappropriate content in reviews.

## Implementation Date
January 28, 2026

## Files Created/Modified

### New Files
1. **`src/services/ContentModerationService.js`** - Main service class
2. **`test-content-moderation.js`** - Content validation tests
3. **`test-auto-flagging-simple.js`** - Auto-flagging logic tests
4. **`test-auto-flagging.js`** - Database integration tests (for future use)

## Features Implemented

### 1. Content Validation Rules (Task 15.2)

The service checks review content for the following violations:

#### ✅ Profanity Detection
- Uses custom profanity word list
- Detects common inappropriate language
- Auto-flags reviews containing profanity
- Example: "This place is damn terrible" → **FLAGGED**

#### ✅ External Links Detection
- Detects HTTP/HTTPS URLs
- Detects www. links
- Auto-flags reviews with external links
- Example: "Visit https://example.com" → **FLAGGED**

#### ✅ Contact Information Detection
- **Email addresses**: Detects email patterns
- **Phone numbers**: Detects multiple formats:
  - `555-123-4567`
  - `(555) 123-4567`
  - `5551234567`
  - International formats with country codes
- Auto-flags reviews with contact info
- Example: "Email me at test@test.com" → **FLAGGED**

#### ✅ Minimum Length Validation
- Rejects reviews under 10 characters
- Does NOT auto-flag (just rejects)
- Example: "Bad" → **REJECTED**

### 2. Auto-Flagging Logic (Task 15.3)

The service automatically flags reviews based on content rules:

#### Auto-Flag Triggers
- **Profanity**: Inappropriate language detected
- **External Links**: URLs or web addresses found
- **Contact Info**: Email or phone numbers detected

#### Auto-Flag Behavior
- Sets review status to `'flagged'`
- Records flag reason (e.g., "profanity, external_links")
- Records flagged timestamp
- Can be triggered by system or user

#### Rejection vs. Flagging
- **Reject**: Reviews under 10 characters (prevents submission)
- **Auto-Flag**: Reviews with profanity, links, or contact info (allows submission but flags for review)

### 3. ContentModerationService Class (Task 15.1)

#### Methods Implemented

##### `checkContent(content)`
Validates review content and returns violation details.

**Returns:**
```javascript
{
  hasViolations: boolean,
  violations: Array<{type, message}>,
  shouldAutoFlag: boolean,
  shouldReject: boolean
}
```

**Example:**
```javascript
const result = ContentModerationService.checkContent('This place sucks!');
// Returns: { hasViolations: true, shouldAutoFlag: true, violations: [...] }
```

##### `flagReview(reviewId, reason, flaggedBy)`
Flags a review for admin moderation.

**Parameters:**
- `reviewId`: Review ID to flag
- `reason`: Flag reason (e.g., "profanity")
- `flaggedBy`: User ID or 'system' for auto-flag

**Returns:** Updated review object

##### `autoFlag(review)`
Automatically flags reviews based on content rules.

**Parameters:**
- `review`: Review object or comment string

**Returns:**
```javascript
{
  shouldFlag: boolean,
  reason: string | null,
  violations: Array<{type, message}>
}
```

**Example:**
```javascript
const result = await ContentModerationService.autoFlag('Email me at test@test.com');
// Returns: { shouldFlag: true, reason: 'contact_info', violations: [...] }
```

##### `getFlaggedReviews(filters)`
Retrieves flagged reviews for admin moderation.

**Parameters:**
```javascript
{
  status: 'flagged' | 'hidden' | 'visible',
  reason: string (optional),
  page: number,
  limit: number
}
```

**Returns:**
```javascript
{
  reviews: Array<Review>,
  total: number,
  page: number,
  pages: number
}
```

##### `moderateReview(reviewId, action, adminId, notes)`
Admin action to moderate a flagged review.

**Actions:**
- `'approve'`: Set status to visible
- `'hide'`: Set status to hidden
- `'delete'`: Set status to deleted

**Parameters:**
- `reviewId`: Review to moderate
- `action`: Moderation action
- `adminId`: Admin user ID
- `notes`: Moderation notes (optional)

**Returns:** Updated review object

##### `cleanContent(content)`
Utility to clean profanity from content.

**Example:**
```javascript
const cleaned = ContentModerationService.cleanContent('This damn place sucks!');
// Returns: 'This **** place ****!'
```

## Test Results

### Content Validation Tests
All 12 tests passed:
- ✅ Valid content (no violations)
- ✅ Too short content (rejected)
- ✅ Content with profanity (auto-flagged)
- ✅ Content with external links (auto-flagged)
- ✅ Content with www links (auto-flagged)
- ✅ Content with email addresses (auto-flagged)
- ✅ Content with phone numbers - multiple formats (auto-flagged)
- ✅ Multiple violations (auto-flagged with all reasons)
- ✅ Empty content (rejected)
- ✅ Null content (rejected)

### Auto-Flagging Tests
All 8 tests passed:
- ✅ Auto-flag review with profanity
- ✅ Auto-flag review with external links
- ✅ Auto-flag review with contact info (email)
- ✅ Auto-flag review with contact info (phone)
- ✅ Clean review NOT auto-flagged
- ✅ Multiple violations handled correctly
- ✅ Too short review rejected (not auto-flagged)
- ✅ Clean profanity utility works

## Usage Examples

### 1. Validate Review Before Submission
```javascript
const ContentModerationService = require('./src/services/ContentModerationService');

// Check content
const result = ContentModerationService.checkContent(reviewComment);

if (result.shouldReject) {
  return res.status(400).json({ 
    error: result.violations[0].message 
  });
}

if (result.shouldAutoFlag) {
  // Create review but flag it
  review.status = 'flagged';
  review.flagReason = result.violations.map(v => v.type).join(', ');
}
```

### 2. Auto-Flag Existing Review
```javascript
// Auto-flag a review
const result = await ContentModerationService.autoFlag(review);

if (result.shouldFlag) {
  console.log('Review flagged:', result.reason);
  console.log('Violations:', result.violations);
}
```

### 3. Get Flagged Reviews for Admin
```javascript
// Get all flagged reviews
const flaggedReviews = await ContentModerationService.getFlaggedReviews({
  status: 'flagged',
  page: 1,
  limit: 20
});

console.log(`Found ${flaggedReviews.total} flagged reviews`);
```

### 4. Moderate a Flagged Review
```javascript
// Admin approves a review
const review = await ContentModerationService.moderateReview(
  reviewId,
  'approve',
  adminId,
  'Reviewed and approved - no violations found'
);

console.log('Review status:', review.status); // 'visible'
```

## Integration with Review Submission

The Content Moderation Service should be integrated into the review submission flow:

```javascript
// In reviews.controller.js
const ContentModerationService = require('../services/ContentModerationService');

async function createReview(req, res) {
  const { rating, comment, photos } = req.body;
  
  // Check content for violations
  const moderationResult = ContentModerationService.checkContent(comment);
  
  // Reject if too short
  if (moderationResult.shouldReject) {
    return res.status(400).json({ 
      error: moderationResult.violations[0].message 
    });
  }
  
  // Create review
  const review = await ReviewService.createReview(bookingId, userId, {
    rating,
    comment,
    photos
  });
  
  // Auto-flag if needed
  if (moderationResult.shouldAutoFlag) {
    await ContentModerationService.flagReview(
      review._id,
      moderationResult.violations.map(v => v.type).join(', '),
      'system'
    );
  }
  
  return res.status(201).json({ review });
}
```

## Dependencies

### Existing
- `mongoose` - Database ORM
- `bcryptjs` - Password hashing (for tests)

### Custom Implementation
- Custom profanity word list (instead of bad-words package due to ES module compatibility)
- Regex patterns for URL, email, and phone detection

## Future Enhancements

1. **Enhanced Profanity Detection**
   - Use external API service (e.g., Perspective API)
   - Support multiple languages
   - Context-aware detection

2. **Machine Learning Integration**
   - Sentiment analysis
   - Spam detection
   - Fake review detection

3. **Admin Dashboard**
   - Visual interface for moderation
   - Bulk actions
   - Moderation analytics

4. **Notification System**
   - Notify admins of flagged reviews
   - Notify users when their review is moderated
   - Email alerts for high-priority flags

5. **Whitelist/Blacklist**
   - Allow certain URLs (e.g., official website)
   - Custom profanity list per platform
   - User-specific moderation rules

## Notes

- The service uses a basic profanity word list. In production, consider using a more comprehensive list or external service.
- Phone number detection covers common formats but may need adjustment for international numbers.
- The service is designed to be extensible - new validation rules can be easily added to the `checkContent` method.

## Status

✅ **Task 15.1**: Create ContentModerationService class - **COMPLETE**
✅ **Task 15.2**: Implement content validation rules - **COMPLETE**
✅ **Task 15.3**: Implement auto-flagging logic - **COMPLETE**

**Overall Task 15**: Implement Content Moderation Service - **COMPLETE**

---

**Implementation completed by**: Kiro AI Assistant
**Date**: January 28, 2026
