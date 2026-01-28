/**
 * Migration: Add Review Enhancement Fields
 * 
 * This migration adds new fields to support the enhanced review system:
 * - Review model: edit tracking, enhanced owner reply, moderation fields
 * - Booking model: hasReview and reviewId fields
 * - Listing model: rating, reviewCount, and ratingDistribution fields
 * 
 * Run with: node migrations/add-review-enhancements.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Review = require('../src/models/Review');
const Booking = require('../src/models/Booking');
const Listing = require('../src/models/Listing');

async function migrateReviews() {
  console.log('\n=== Migrating Review Model ===');
  
  try {
    const reviews = await Review.find({});
    console.log(`Found ${reviews.length} reviews to migrate`);
    
    let updated = 0;
    for (const review of reviews) {
      let needsUpdate = false;
      
      // Migrate old field names to new field names
      if (review.user && !review.userId) {
        review.userId = review.user;
        needsUpdate = true;
      }
      
      if (review.listing && !review.listingId) {
        review.listingId = review.listing;
        needsUpdate = true;
      }
      
      if (review.booking && !review.bookingId) {
        review.bookingId = review.booking;
        needsUpdate = true;
      }
      
      // Get ownerId from listing if not set
      if (!review.ownerId && review.listingId) {
        const listing = await mongoose.model('Listing').findById(review.listingId);
        if (listing && listing.owner) {
          review.ownerId = listing.owner;
          needsUpdate = true;
        }
      }
      
      // Add edit tracking fields if missing
      if (review.isEdited === undefined) {
        review.isEdited = false;
        needsUpdate = true;
      }
      
      // Migrate images to photos array (simple URL strings)
      if (review.images && review.images.length > 0 && (!review.photos || review.photos.length === 0)) {
        review.photos = review.images.map(img => img.url).filter(Boolean);
        needsUpdate = true;
      }
      
      // Migrate old ownerReply structure to new structure
      if (review.ownerReply && review.ownerReply.message && !review.ownerReply.text) {
        review.ownerReply = {
          text: review.ownerReply.message || '',
          createdAt: review.ownerReply.repliedAt || null,
          updatedAt: review.ownerReply.repliedAt || null,
          isEdited: false,
        };
        needsUpdate = true;
      }
      
      // Migrate flaggedReason to flagReason
      if (review.flaggedReason && !review.flagReason) {
        review.flagReason = review.flaggedReason;
        needsUpdate = true;
      }
      
      // Add moderation fields if missing
      if (review.status === 'flagged' && !review.flaggedAt) {
        review.flaggedAt = review.updatedAt || review.createdAt;
        needsUpdate = true;
      }
      
      // Ensure comment has min/max length constraints
      if (review.comment && review.comment.length > 500) {
        review.comment = review.comment.substring(0, 500);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await review.save({ validateBeforeSave: false });
        updated++;
      }
    }
    
    console.log(`✓ Updated ${updated} reviews`);
  } catch (error) {
    console.error('✗ Error migrating reviews:', error.message);
    throw error;
  }
}

async function migrateBookings() {
  console.log('\n=== Migrating Booking Model ===');
  
  try {
    const bookings = await Booking.find({});
    console.log(`Found ${bookings.length} bookings to migrate`);
    
    let updated = 0;
    for (const booking of bookings) {
      let needsUpdate = false;
      
      // Add ownerId from listing if missing
      if (!booking.ownerId && booking.listingId) {
        const listing = await mongoose.model('Listing').findById(booking.listingId);
        if (listing && listing.owner) {
          booking.ownerId = listing.owner;
          needsUpdate = true;
        }
      }
      
      // Add hasReview field if missing
      if (booking.hasReview === undefined) {
        // Check if a review exists for this booking
        const review = await Review.findOne({ bookingId: booking._id });
        booking.hasReview = !!review;
        
        if (review) {
          booking.reviewId = review._id;
        }
        
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await booking.save({ validateBeforeSave: false });
        updated++;
      }
    }
    
    console.log(`✓ Updated ${updated} bookings`);
  } catch (error) {
    console.error('✗ Error migrating bookings:', error.message);
    throw error;
  }
}

async function migrateListings() {
  console.log('\n=== Migrating Listing Model ===');
  
  try {
    const listings = await Listing.find({});
    console.log(`Found ${listings.length} listings to migrate`);
    
    let updated = 0;
    for (const listing of listings) {
      let needsUpdate = false;
      
      // Add rating fields if missing
      if (listing.rating === undefined) {
        listing.rating = 0;
        needsUpdate = true;
      }
      
      if (listing.reviewCount === undefined) {
        listing.reviewCount = 0;
        needsUpdate = true;
      }
      
      if (!listing.ratingDistribution) {
        listing.ratingDistribution = {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        };
        needsUpdate = true;
      }
      
      // Calculate actual rating from existing reviews
      const reviews = await Review.find({ 
        listingId: listing._id, 
        status: 'visible' 
      });
      
      if (reviews.length > 0) {
        // Calculate average rating
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        listing.rating = totalRating / reviews.length;
        listing.reviewCount = reviews.length;
        
        // Calculate rating distribution
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(r => {
          distribution[r.rating] = (distribution[r.rating] || 0) + 1;
        });
        listing.ratingDistribution = distribution;
        
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await listing.save({ validateBeforeSave: false });
        updated++;
      }
    }
    
    console.log(`✓ Updated ${updated} listings`);
  } catch (error) {
    console.error('✗ Error migrating listings:', error.message);
    throw error;
  }
}

async function runMigration() {
  console.log('Starting Review Enhancement Migration...');
  console.log('Database:', process.env.MONGODB_URI ? 'Connected' : 'Not configured');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');
    
    // Run migrations
    await migrateReviews();
    await migrateBookings();
    await migrateListings();
    
    console.log('\n=== Migration Complete ===');
    console.log('✓ All models updated successfully');
    
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed');
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
