// src/middleware/rateLimiting.js
/**
 * Rate limiting middleware for review system
 * Prevents abuse and spam by limiting request rates
 */

const rateLimit = require('express-rate-limit');

/**
 * Helper function to extract user ID from request
 */
function getUserId(req) {
  if (!req.user) return req.ip; // Fall back to IP if no user
  
  const mongoId = req.user._id || req.user.id || req.user.userId;
  const firebaseUid = req.user.uid;
  
  if (mongoId) return String(mongoId);
  if (firebaseUid) return String(firebaseUid);
  
  return req.ip;
}

/**
 * Custom key generator that uses user ID or IP
 */
const keyGenerator = (req) => {
  return getUserId(req);
};

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  const retryAfter = res.getHeader('Retry-After');
  
  res.status(429).json({
    message: 'Too many requests. Please try again later.',
    retryAfter: retryAfter ? parseInt(retryAfter) : null,
    error: 'RATE_LIMIT_EXCEEDED'
  });
};

/**
 * Rate limiter for review submissions
 * Limit: 5 reviews per hour per user
 */
exports.reviewSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'You have submitted too many reviews. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for review edits
 * Limit: 10 edits per hour per user
 */
exports.reviewEditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'You have edited reviews too many times. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for photo uploads
 * Limit: 20 uploads per hour per user
 */
exports.photoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'You have uploaded too many photos. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for owner replies
 * Limit: 20 replies per hour per owner
 */
exports.ownerReplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'You have replied to too many reviews. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for flagging reviews
 * Limit: 10 flags per hour per user
 */
exports.reviewFlagLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'You have flagged too many reviews. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for general review API requests
 * Limit: 100 requests per 15 minutes per user
 */
exports.reviewApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many API requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Rate limiter for public review listing
 * Limit: 60 requests per minute per IP
 */
exports.publicReviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Rate limiter for admin moderation actions
 * Limit: 100 actions per hour per admin
 */
exports.adminModerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: 'Too many moderation actions. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Strict rate limiter for sensitive operations
 * Limit: 3 requests per minute per user
 */
exports.strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Global rate limiter for all review routes
 * Limit: 200 requests per 15 minutes per user
 */
exports.globalReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests to the review system. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    return req.user?.role === 'admin' || req.user?.isAdmin === true;
  }
});

/**
 * Custom rate limiter for specific use cases
 */
exports.createCustomLimiter = (options) => {
  const {
    windowMs = 60 * 60 * 1000,
    max = 10,
    message = 'Too many requests. Please try again later.',
    skipAdmin = true
  } = options;

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipAdmin ? (req) => {
      return req.user?.role === 'admin' || req.user?.isAdmin === true;
    } : undefined
  });
};

/**
 * Middleware to log rate limit hits
 */
exports.logRateLimitHit = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (res.statusCode === 429) {
      const userId = getUserId(req);
      const endpoint = req.originalUrl || req.url;
      const method = req.method;
      
      console.warn('[RateLimit] Rate limit exceeded:', {
        userId,
        endpoint,
        method,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

module.exports = exports;
