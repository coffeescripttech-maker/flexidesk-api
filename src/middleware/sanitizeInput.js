// src/middleware/sanitizeInput.js
/**
 * Input sanitization middleware for review system
 * Protects against XSS, injection attacks, and malicious content
 */

const validator = require('validator');
const xss = require('xss');

/**
 * XSS filter options - more permissive for review content
 * Allows basic formatting but strips dangerous tags and attributes
 */
const xssOptions = {
  whiteList: {
    // Allow no HTML tags in reviews for maximum security
    // Reviews should be plain text only
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Sanitize a string value
 * - Trims whitespace
 * - Removes XSS threats
 * - Normalizes line breaks
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  
  // Trim whitespace
  let sanitized = value.trim();
  
  // Remove XSS threats
  sanitized = xss(sanitized, xssOptions);
  
  // Normalize line breaks (convert all to \n)
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  return sanitized;
}

/**
 * Sanitize review comment
 * - Removes HTML tags
 * - Prevents XSS attacks
 * - Validates length
 */
function sanitizeReviewComment(comment) {
  if (!comment) return '';
  
  let sanitized = sanitizeString(comment);
  
  // Additional validation for review comments
  // Remove excessive whitespace (more than 2 consecutive spaces)
  sanitized = sanitized.replace(/\s{3,}/g, '  ');
  
  // Remove excessive line breaks (more than 2 consecutive)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  return sanitized;
}

/**
 * Sanitize owner reply text
 * Same rules as review comments
 */
function sanitizeReplyText(text) {
  return sanitizeReviewComment(text);
}

/**
 * Validate and sanitize rating
 * Ensures rating is a valid integer between 1-5
 */
function sanitizeRating(rating) {
  // Reject non-numeric types
  if (typeof rating === 'boolean' || typeof rating === 'object' || rating === null) {
    throw new Error('Rating must be a number between 1 and 5');
  }
  
  // Convert to number
  const num = Number(rating);
  
  // Check if valid number
  if (isNaN(num)) {
    throw new Error('Rating must be a number between 1 and 5');
  }
  
  // Check if integer
  if (!Number.isInteger(num)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }
  
  // Check bounds
  if (num < 1 || num > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  
  return num;
}

/**
 * Validate and sanitize photo URLs
 * Ensures URLs are valid and from trusted sources
 */
function sanitizePhotoUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid photo URL');
  }
  
  // Trim and validate URL format
  const trimmed = url.trim();
  
  if (!validator.isURL(trimmed, { 
    protocols: ['http', 'https'],
    require_protocol: true 
  })) {
    throw new Error('Invalid photo URL format');
  }
  
  // Only allow Cloudinary URLs (our trusted photo storage)
  if (!trimmed.includes('cloudinary.com') && !trimmed.includes('res.cloudinary.com')) {
    throw new Error('Photo URLs must be from Cloudinary');
  }
  
  return trimmed;
}

/**
 * Sanitize flag reason
 * Ensures only valid flag reasons are accepted
 */
function sanitizeFlagReason(reason) {
  if (!reason || typeof reason !== 'string') {
    throw new Error('Flag reason is required');
  }
  
  const validReasons = ['spam', 'inappropriate', 'fake', 'other'];
  const sanitized = reason.trim().toLowerCase();
  
  if (!validReasons.includes(sanitized)) {
    throw new Error(`Invalid flag reason. Must be one of: ${validReasons.join(', ')}`);
  }
  
  return sanitized;
}

/**
 * Middleware: Sanitize review submission data
 * Used on: POST /api/reviews/booking/:bookingId, PUT /api/reviews/:id
 */
exports.sanitizeReviewData = (req, res, next) => {
  try {
    // Sanitize rating if provided
    if (req.body.rating !== undefined) {
      req.body.rating = sanitizeRating(req.body.rating);
    }
    
    // Sanitize comment if provided
    if (req.body.comment !== undefined) {
      req.body.comment = sanitizeReviewComment(req.body.comment);
      
      // Validate length after sanitization
      if (req.body.comment.length < 10) {
        return res.status(400).json({ 
          message: 'Review comment must be at least 10 characters after removing formatting.' 
        });
      }
      
      if (req.body.comment.length > 500) {
        return res.status(400).json({ 
          message: 'Review comment must not exceed 500 characters.' 
        });
      }
    }
    
    // Sanitize photo URLs if provided
    if (req.body.photos && Array.isArray(req.body.photos)) {
      try {
        req.body.photos = req.body.photos.map(url => sanitizePhotoUrl(url));
        
        // Validate photo count
        if (req.body.photos.length > 5) {
          return res.status(400).json({ 
            message: 'Maximum 5 photos allowed per review.' 
          });
        }
      } catch (err) {
        return res.status(400).json({ 
          message: err.message || 'Invalid photo URL' 
        });
      }
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ 
      message: err.message || 'Invalid review data' 
    });
  }
};

/**
 * Middleware: Sanitize owner reply data
 * Used on: POST /api/reviews/:id/reply, PUT /api/reviews/:id/reply
 */
exports.sanitizeReplyData = (req, res, next) => {
  try {
    // Sanitize reply text
    if (req.body.text !== undefined) {
      req.body.text = sanitizeReplyText(req.body.text);
      
      // Validate length after sanitization
      if (req.body.text.length === 0) {
        return res.status(400).json({ 
          message: 'Reply text is required.' 
        });
      }
      
      if (req.body.text.length > 300) {
        return res.status(400).json({ 
          message: 'Reply text must not exceed 300 characters.' 
        });
      }
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ 
      message: err.message || 'Invalid reply data' 
    });
  }
};

/**
 * Middleware: Sanitize flag data
 * Used on: POST /api/reviews/:id/flag
 */
exports.sanitizeFlagData = (req, res, next) => {
  try {
    // Sanitize flag reason
    if (req.body.reason !== undefined) {
      req.body.reason = sanitizeFlagReason(req.body.reason);
    }
    
    // Sanitize details if provided
    if (req.body.details !== undefined) {
      req.body.details = sanitizeString(req.body.details);
      
      // Limit details length
      if (req.body.details.length > 500) {
        return res.status(400).json({ 
          message: 'Flag details must not exceed 500 characters.' 
        });
      }
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ 
      message: err.message || 'Invalid flag data' 
    });
  }
};

/**
 * Middleware: Sanitize moderation data
 * Used on: POST /api/admin/reviews/:id/moderate
 */
exports.sanitizeModerationData = (req, res, next) => {
  try {
    // Sanitize action
    if (req.body.action !== undefined) {
      const validActions = ['approve', 'hide', 'delete'];
      const action = String(req.body.action).trim().toLowerCase();
      
      if (!validActions.includes(action)) {
        return res.status(400).json({ 
          message: `Invalid moderation action. Must be one of: ${validActions.join(', ')}` 
        });
      }
      
      req.body.action = action;
    }
    
    // Sanitize notes if provided
    if (req.body.notes !== undefined) {
      req.body.notes = sanitizeString(req.body.notes);
      
      // Limit notes length
      if (req.body.notes.length > 1000) {
        return res.status(400).json({ 
          message: 'Moderation notes must not exceed 1000 characters.' 
        });
      }
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ 
      message: err.message || 'Invalid moderation data' 
    });
  }
};

/**
 * Middleware: Sanitize file uploads
 * Validates photo uploads for security
 */
exports.sanitizePhotoUpload = (req, res, next) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return next();
    }
    
    // Validate file count
    if (req.files.length > 5) {
      return res.status(400).json({ 
        message: 'Maximum 5 photos allowed per review.' 
      });
    }
    
    // Validate each file
    for (const file of req.files) {
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ 
          message: `File ${file.originalname} exceeds 5MB size limit.` 
        });
      }
      
      // Validate file type
      const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ 
          message: `File ${file.originalname} has invalid type. Only JPG, PNG, and WEBP are allowed.` 
        });
      }
      
      // Sanitize filename (remove special characters)
      if (file.originalname) {
        file.originalname = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      }
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ 
      message: err.message || 'Invalid photo upload' 
    });
  }
};

/**
 * Utility function: Escape HTML for display
 * Use this when rendering user content in HTML
 */
exports.escapeHtml = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Utility function: Strip all HTML tags
 * Use this for plain text extraction
 */
exports.stripHtml = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  return text.replace(/<[^>]*>/g, '');
};

module.exports = exports;
