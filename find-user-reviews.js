// find-user-reviews.js - Find all reviews by a user
require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('./src/models/Review');
const User = require('./src/models/User');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');

const userEmail = process.argv[2] || 'dextermirandas@gmail.com';

async function findUserReviews() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log('❌ User not found:', userEmail);
      process.exit(1);
    }

    console.log('👤 User:', user.fullName || user.email);
    console.log('   ID:', user._id);
    console.log('   Firebase UID:', user.firebaseUid);
    console.log('');

    // Find all reviews by this user
    const reviews = await Review.find({ 
      $or: [
        { user: user._id },
        { user: user.firebaseUid }
      ]
    })
      .populate('booking')
      .populate('listing', 'title shortDesc')
      .sort({ createdAt: -1 });

    if (reviews.length === 0) {
      console.log('❌ No reviews found for this user');
    } else {
      console.log(`✅ Found ${reviews.length} review(s):\n`);
      reviews.forEach((review, index) => {
        console.log(`Review #${index + 1}:`);
        console.log('   Review ID:', review._id);
        console.log('   Booking ID:', review.booking?._id || review.booking);
        console.log('   Listing:', review.listing?.title || review.listing?.shortDesc);
        console.log('   Rating:', review.rating);
        console.log('   Comment:', review.comment?.substring(0, 80) + (review.comment?.length > 80 ? '...' : ''));
        console.log('   Status:', review.status);
        console.log('   Visibility:', review.visibility);
        console.log('   Photos:', review.photos?.length || 0);
        console.log('   Created:', review.createdAt);
        console.log('');
      });
    }

    await mongoose.disconnect();
    console.log('✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

findUserReviews();
