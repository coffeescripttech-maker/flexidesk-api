/**
 * Test Script: Review Model Enhancements
 * 
 * This script tests the enhanced review data models to ensure:
 * - Review model has all required fields
 * - Booking model has review tracking fields
 * - Listing model has rating fields
 * - Migration script works correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');

async function testReviewModel() {
  console.log('\n=== Testing Review Model ===');
  
  try {
    // Check schema fields
    const reviewSchema = Review.schema.obj;
    
    const requiredFields = [
      'userId', 'listingId', 'bookingId', 'ownerId',
      'rating', 'comment', 'photos', 'images',
      'status', 'flagReason', 'flaggedBy', 'flaggedAt',
      'moderatedBy', 'moderatedAt', 'moderationNotes',
      'isEdited', 'editedAt', 'ownerReply'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in reviewSchema));
    
    if (missingFields.length > 0) {
      console.log('✗ Missing fields:', missingFields.join(', '));
      return false;
    }
    
    console.log('✓ All required fields present');
    
    // Check indexes
    const indexes = Review.schema.indexes();
    console.log(`✓ Found ${indexes.length} indexes`);
    
    // Check virtual fields
    const virtuals = Object.keys(Review.schema.virtuals);
    if (virtuals.includes('canEdit')) {
      console.log('✓ canEdit virtual field exists');
    } else {
      console.log('✗ canEdit virtual field missing');
      return false;
    }
    
    // Check ownerReply structure
    if (reviewSchema.ownerReply && 
        reviewSchema.ownerReply.text && 
        reviewSchema.ownerReply.createdAt &&
        reviewSchema.ownerReply.updatedAt &&
        reviewSchema.ownerReply.isEdited) {
      console.log('✓ ownerReply structure correct');
    } else {
      console.log('✗ ownerReply structure incorrect');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ Error testing Review model:', error.message);
    return false;
  }
}

async function testBookingModel() {
  console.log('\n=== Testing Booking Model ===');
  
  try {
    const bookingSchema = Booking.schema.obj;
    
    const requiredFields = ['hasReview', 'reviewId', 'ownerId'];
    const missingFields = requiredFields.filter(field => !(field in bookingSchema));
    
    if (missingFields.length > 0) {
      console.log('✗ Missing fields:', missingFields.join(', '));
      return false;
    }
    
    console.log('✓ All required fields present');
    
    // Check field types
    if (bookingSchema.hasReview.type === Boolean) {
      console.log('✓ hasReview is Boolean');
    } else {
      console.log('✗ hasReview type incorrect');
      return false;
    }
    
    if (bookingSchema.reviewId.ref === 'Review') {
      console.log('✓ reviewId references Review model');
    } else {
      console.log('✗ reviewId reference incorrect');
     