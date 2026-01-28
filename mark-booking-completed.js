// mark-booking-completed.js
// Quick script to mark a booking as completed for testing reviews

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./src/models/Booking');

async function markBookingCompleted() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the most recent booking
    const booking = await Booking.findOne()
      .sort({ createdAt: -1 })
      .populate('listingId', 'venue title');

    if (!booking) {
      console.log('No bookings found');
      process.exit(0);
    }

    console.log('\nMost recent booking:');
    console.log('ID:', booking._id);
    console.log('Listing:', booking.listingId?.venue || booking.listingId?.title);
    console.log('Dates:', booking.startDate, 'to', booking.endDate);
    console.log('Current status:', booking.status);

    if (booking.status === 'completed') {
      console.log('\n✅ Booking is already completed!');
    } else {
      // Update to completed and set dates to the past
      booking.status = 'completed';
      booking.startDate = '2026-01-20';
      booking.endDate = '2026-01-21';
      await booking.save();

      console.log('\n✅ Booking marked as completed!');
      console.log('Updated dates to past:', booking.startDate, 'to', booking.endDate);
    }

    console.log('\nYou can now write a review at:');
    console.log('http://localhost:5173/app/bookings');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

markBookingCompleted();
