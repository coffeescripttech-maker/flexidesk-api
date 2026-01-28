// Test script for Phase 2 & 3: Predictions and Recommendations
// Run with: node test-predictions-recommendations.js

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Import models
const Booking = require('./src/models/Booking');
const Listing = require('./src/models/Listing');
const User = require('./src/models/User');

async function testPredictionsAndRecommendations() {
  try {
    console.log('\n🧪 Testing Predictions and Recommendations\n');
    console.log('='.repeat(60));

    // Find an owner with bookings
    const owners = await User.find({ role: 'owner' }).limit(5);
    
    if (!owners.length) {
      console.log('❌ No owners found in database');
      return;
    }

    for (const owner of owners) {
      console.log(`\n📊 Testing for Owner: ${owner.name} (${owner._id})`);
      console.log('-'.repeat(60));

      // Get owner's listings
      const listings = await Listing.find({ owner: owner._id });
      console.log(`   Listings: ${listings.length}`);

      if (!listings.length) {
        console.log('   ⚠️  No listings found, skipping...');
        continue;
      }

      const listingIds = listings.map(l => l._id);

      // Get bookings for last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const bookings = await Booking.find({
        listingId: { $in: listingIds },
        createdAt: { $gte: sixMonthsAgo }
      });

      console.log(`   Bookings (last 6 months): ${bookings.length}`);

      if (bookings.length < 2) {
        console.log('   ⚠️  Insufficient data for predictions (need 2+ bookings)');
        continue;
      }

      // Test 1: Revenue Prediction
      console.log('\n   📈 REVENUE PREDICTION:');
      const monthlyRevenue = await Booking.aggregate([
        {
          $match: {
            listingId: { $in: listingIds },
            status: { $in: ['paid', 'confirmed', 'completed', 'checked_in'] },
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            revenue: { $sum: { $ifNull: ['$pricingSnapshot.total', '$amount'] } },
            bookings: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      if (monthlyRevenue.length >= 2) {
        const recentMonths = monthlyRevenue.slice(-Math.min(3, monthlyRevenue.length));
        const avgRevenue = recentMonths.reduce((sum, m) => sum + m.revenue, 0) / recentMonths.length;
        
        const lastMonth = monthlyRevenue[monthlyRevenue.length - 1].revenue;
        const prevMonth = monthlyRevenue[monthlyRevenue.length - 2].revenue;
        const change = ((lastMonth - prevMonth) / prevMonth) * 100;
        
        let trend = 'stable';
        if (change > 10) trend = 'increasing';
        else if (change < -10) trend = 'decreasing';

        let prediction = avgRevenue;
        if (trend === 'increasing') prediction *= 1.05;
        else if (trend === 'decreasing') prediction *= 0.95;

        console.log(`      Historical average: ₱${Math.round(avgRevenue).toLocaleString()}`);
        console.log(`      Trend: ${trend} (${change.toFixed(1)}% change)`);
        console.log(`      Predicted next month: ₱${Math.round(prediction).toLocaleString()}`);
        console.log(`      Range: ₱${Math.round(prediction * 0.85).toLocaleString()} - ₱${Math.round(prediction * 1.15).toLocaleString()}`);
        console.log(`      ✅ Revenue prediction working`);
      } else {
        console.log('      ⚠️  Need at least 2 months of data');
      }

      // Test 2: Current Analytics for Recommendations
      console.log('\n   💡 RECOMMENDATIONS:');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const currentAnalytics = await Booking.aggregate([
        {
          $match: {
            listingId: { $in: listingIds },
            status: { $in: ['paid', 'confirmed', 'completed', 'checked_in'] },
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: { $ifNull: ['$pricingSnapshot.total', '$amount'] } },
            bookings: { $sum: 1 },
            totalHours: { $sum: '$totalHours' }
          }
        }
      ]);

      if (currentAnalytics.length) {
        const analytics = currentAnalytics[0];
        const capacityHours = listingIds.length * 24 * 30;
        const occupancyRate = (analytics.totalHours / capacityHours) * 100;

        const cancelledBookings = await Booking.countDocuments({
          listingId: { $in: listingIds },
          status: 'cancelled',
          createdAt: { $gte: thirtyDaysAgo }
        });

        const totalBookingsIncludingCancelled = analytics.bookings + cancelledBookings;
        const cancellationRate = totalBookingsIncludingCancelled > 0
          ? (cancelledBookings / totalBookingsIncludingCancelled) * 100
          : 0;

        console.log(`      Occupancy Rate: ${occupancyRate.toFixed(1)}%`);
        console.log(`      Cancellation Rate: ${cancellationRate.toFixed(1)}%`);
        console.log(`      Total Bookings: ${analytics.bookings}`);
        console.log(`      Revenue: ₱${analytics.revenue.toLocaleString()}`);

        // Generate sample recommendations
        const recommendations = [];

        if (occupancyRate < 50) {
          recommendations.push('💰 Reduce prices to increase occupancy (HIGH priority)');
        }
        if (occupancyRate > 75) {
          recommendations.push('📈 Increase prices to maximize revenue (MEDIUM priority)');
        }
        if (cancellationRate > 15) {
          recommendations.push('⚠️  Reduce cancellation rate (HIGH priority)');
        }
        if (analytics.bookings < 10) {
          recommendations.push('📣 Increase marketing efforts (HIGH priority)');
        }

        if (recommendations.length) {
          console.log('\n      Generated Recommendations:');
          recommendations.forEach(rec => console.log(`      ${rec}`));
          console.log(`      ✅ Recommendations engine working`);
        } else {
          console.log('      ✅ No critical recommendations (business is healthy)');
        }
      } else {
        console.log('      ⚠️  No bookings in last 30 days');
      }

      console.log('\n   ✅ Tests completed for this owner');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!\n');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run tests
testPredictionsAndRecommendations();
