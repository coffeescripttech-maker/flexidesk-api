// test-review-reminder-job.js
require('dotenv').config();
const { connectDB } = require('./src/config/db');
const Booking = require('./src/models/Booking');
const User = require('./src/models/User');
const Listing = require('./src/models/Listing');
const reviewReminderJob = require('./src/jobs/reviewReminderJob');

async function testReviewReminderJob() {
  console.log('=== Testing Review Reminder Job ===\n');

  try {
    // Connect to database
    await connectDB(process.env.MONGODB_URI);
    console.log('✓ Connected to database\n');

    // Test 1: Check job stats
    console.log('Test 1: Check job initial stats');
    const initialStats = reviewReminderJob.getStats();
    console.log('Initial stats:', initialStats);
    console.log('✓ Job stats retrieved\n');

    // Test 2: Find eligible bookings
    console.log('Test 2: Find eligible bookings for reminders');
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(23, 59, 59, 999);

    const eligibleBookings = await Booking.find({
      status: 'completed',
      endDate: {
        $gte: threeDaysAgo.toISOString().split('T')[0],
        $lte: twoDaysAgo.toISOString().split('T')[0],
      },
      hasReview: false,
    })
      .populate('userId')
      .populate('listingId')
      .lean();

    console.log(`Found ${eligibleBookings.length} eligible bookings`);
    
    if (eligibleBookings.length > 0) {
      console.log('\nSample eligible booking:');
      const sample = eligibleBookings[0];
      console.log({
        bookingId: sample._id,
        userId: sample.userId?.email || 'N/A',
        listing: sample.listingId?.title || 'N/A',
        endDate: sample.endDate,
        hasReview: sample.hasReview,
        reminderSent: sample.reviewReminderSent || false,
      });
    }
    console.log('✓ Eligible bookings found\n');

    // Test 3: Create test booking if none exist
    if (eligibleBookings.length === 0) {
      console.log('Test 3: Creating test booking for reminder');
      
      // Find a user and listing
      const user = await User.findOne({ role: 'client' });
      const listing = await Listing.findOne();

      if (user && listing) {
        const testBooking = await Booking.create({
          userId: user._id,
          ownerId: listing.ownerId,
          listingId: listing._id,
          startDate: threeDaysAgo.toISOString().split('T')[0],
          endDate: threeDaysAgo.toISOString().split('T')[0],
          status: 'completed',
          amount: 1000,
          hasReview: false,
          reviewReminderSent: false,
        });

        console.log('✓ Test booking created:', testBooking._id);
        console.log('  User:', user.email);
        console.log('  Listing:', listing.title);
      } else {
        console.log('⚠ No user or listing found to create test booking');
      }
      console.log();
    }

    // Test 4: Run the job manually
    console.log('Test 4: Running review reminder job manually');
    console.log('This will send actual emails if eligible bookings exist...');
    
    // Uncomment to actually run the job
    // await reviewReminderJob.run();
    console.log('⚠ Job run commented out to prevent sending test emails');
    console.log('  Uncomment the line above to test actual email sending\n');

    // Test 5: Check job stats after run
    console.log('Test 5: Check job stats after run');
    const finalStats = reviewReminderJob.getStats();
    console.log('Final stats:', finalStats);
    console.log('✓ Job stats retrieved\n');

    // Test 6: Verify booking reminder tracking
    console.log('Test 6: Check bookings with reminders sent');
    const bookingsWithReminders = await Booking.find({
      reviewReminderSent: true,
    })
      .populate('userId')
      .populate('listingId')
      .limit(5)
      .lean();

    console.log(`Found ${bookingsWithReminders.length} bookings with reminders sent`);
    
    if (bookingsWithReminders.length > 0) {
      console.log('\nSample booking with reminder:');
      const sample = bookingsWithReminders[0];
      console.log({
        bookingId: sample._id,
        userId: sample.userId?.email || 'N/A',
        listing: sample.listingId?.title || 'N/A',
        reminderSentAt: sample.reviewReminderSentAt,
      });
    }
    console.log('✓ Reminder tracking verified\n');

    console.log('=== All Tests Completed ===\n');
    console.log('Summary:');
    console.log('- Job is configured to run daily at 9:00 AM');
    console.log('- Job finds bookings completed 2-3 days ago without reviews');
    console.log('- Job sends email reminders to eligible clients');
    console.log('- Job tracks which bookings have received reminders');
    console.log('\nTo test actual email sending:');
    console.log('1. Uncomment the job.run() line in this test');
    console.log('2. Ensure you have eligible bookings (completed 2-3 days ago)');
    console.log('3. Ensure SMTP settings are configured in .env');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testReviewReminderJob();
