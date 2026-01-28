// check-review-status.js - Check if review exists for a booking
require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('./src/models/Review');
const Booking = require('./src/models/Booking');
const User = require('./src/models/User');
const Listing = require('./src/models/Listing');

const bookingId = process.argv[2] || '69797a4c526f77424ab2c58d';

async function checkReviewStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the booking
    const booking = await Booking.findById(bookingId)
      .populate('userId', 'fullName email')
      .populate('listingId', 'title shortDesc');
    
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      process.exit(1);
    }

    console.log('📋 Booking Details:');
    console.log('   ID:', booking._id);
    console.log('   Status:', booking.status);
    console.log('   User:', booking.userId?.fullName || booking.userId?.email);
    console.log('   Listing:', booking.listingId?.title || booking.listingId?.shortDesc);
    console.log('   Start:', booking.startDate || booking.checkIn);
    console.log('   End:', booking.endDate || booking.checkOut);
    console.log('');

    // Find reviews for this booking
    const reviews = await Review.find({ booking: bookingId })
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 });

    if (reviews.length === 0) {
      console.log('❌ No reviews found for this booking');
    } else {
      console.log(`✅ Found ${reviews.length} review(s):\n`);
      reviews.forEach((review, index) => {
        console.log(`Review #${index + 1}:`);
        console.log('   ID:', review._id);
        console.log('   User:', review.user?.fullName || review.user?.email);
        console.log('   Rating:', review.rating);
        console.log('   Comment:', review.comment?.substring(0, 100) + (review.comment?.length > 100 ? '...' : ''));
        console.log('   Status:', review.status);
        console.log('   Visibility:', review.visibility);
        console.log('   Photos:', review.photos?.length || 0);
        console.log('   Created:', review.createdAt);
        console.log('   Updated:', review.updatedAt);
        console.log('');
      });
    }

    // Check if booking has review reference
    console.log('📌 Booking Review Fields:');
    console.log('   hasReview:', booking.hasReview);
    console.log('   reviewed:', booking.reviewed);
    console.log('   reviewId:', booking.reviewId);

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkReviewStatus();
