/**
 * Test /api/bookings/me response to check listing data structure
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

async function testBookingsMeResponse() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Get a sample booking
    const booking = await Booking.findOne().lean();
    
    if (!booking) {
      console.log('❌ No bookings found in database');
      return;
    }

    console.log('Sample Booking Data:');
    console.log('-------------------');
    console.log('Booking ID:', booking._id);
    console.log('Listing ID:', booking.listingId);
    console.log('User ID:', booking.userId);
    console.log('Status:', booking.status);
    console.log('Amount:', booking.amount);
    console.log('\n');

    // Get the listing
    const listing = await Listing.findById(booking.listingId)
      .select('title venue city country images cover')
      .lean();

    if (!listing) {
      console.log('❌ Listing not found for booking');
      return;
    }

    console.log('Listing Data:');
    console.log('-------------');
    console.log('Listing ID:', listing._id);
    console.log('Title:', listing.title);
    console.log('Venue:', listing.venue);
    console.log('City:', listing.city);
    console.log('Country:', listing.country);
    console.log('\nImage Data:');
    console.log('Images array:', listing.images);
    console.log('Images length:', listing.images?.length || 0);
    console.log('First image:', listing.images?.[0] || 'N/A');
    console.log('Cover:', listing.cover || 'N/A');
    console.log('\n');

    // Simulate what attachListings does
    function pickListing(l) {
      if (!l) return null;
      const { _id, title, venue, city, country, images = [], cover } = l;
      return { _id, title, venue, city, country, images, cover };
    }

    const pickedListing = pickListing(listing);
    console.log('Picked Listing (what API returns):');
    console.log('-----------------------------------');
    console.log(JSON.stringify(pickedListing, null, 2));
    console.log('\n');

    // Check what the frontend would see
    const img = pickedListing?.images?.[0] || pickedListing?.cover || "";
    console.log('Image URL that frontend would use:');
    console.log('----------------------------------');
    console.log('img =', img || '(empty string)');
    console.log('\n');

    if (!img) {
      console.log('⚠️  ISSUE FOUND: No image available!');
      console.log('\nPossible reasons:');
      console.log('1. Listing has no images array or it\'s empty');
      console.log('2. Listing has no cover field or it\'s null/undefined');
      console.log('\nSolution:');
      console.log('- Add images to the listing in the database');
      console.log('- Or set a cover image for the listing');
      console.log('- Or add a placeholder image in the frontend');
    } else {
      console.log('✓ Image URL found:', img);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

testBookingsMeResponse();
