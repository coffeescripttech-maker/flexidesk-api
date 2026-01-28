/**
 * Debug Search Query
 * Check what listings exist and test the search query
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/flexidesk';

async function debugSearch() {
  console.log('=== Debug Search Query ===\n');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check total active listings
    const totalActive = await Listing.countDocuments({ status: 'active' });
    console.log(`Total active listings: ${totalActive}\n`);

    // Check listings with prices
    console.log('Checking listings with price data:');
    const withPrices = await Listing.find({
      status: 'active',
      $or: [
        { priceSeatDay: { $exists: true, $ne: 0, $gt: 0 } },
        { priceSeatHour: { $exists: true, $ne: 0, $gt: 0 } },
        { priceWholeDay: { $exists: true, $ne: 0, $gt: 0 } },
      ]
    }).limit(5).lean();

    console.log(`  Found ${withPrices.length} listings with prices`);
    withPrices.forEach(listing => {
      console.log(`  - ${listing.venue || listing.title}`);
      console.log(`    Category: ${listing.category || 'none'}`);
      console.log(`    priceSeatDay: ₱${listing.priceSeatDay || 0}`);
      console.log(`    priceSeatHour: ₱${listing.priceSeatHour || 0}`);
      console.log(`    priceWholeDay: ₱${listing.priceWholeDay || 0}`);
    });
    console.log();

    // Check categories
    const categories = await Listing.distinct('category', { status: 'active' });
    console.log(`Available categories: ${categories.filter(Boolean).join(', ') || 'None'}\n`);

    // Test the exact query from your request
    console.log('Testing query: minPrice=600, category=office');
    const testQuery = {
      status: 'active',
      $and: [
        {
          $or: [
            { priceSeatDay: { $exists: true, $ne: 0, $gte: 600 } },
            { priceSeatHour: { $exists: true, $ne: 0, $gte: 600 } },
            { priceRoomHour: { $exists: true, $ne: 0, $gte: 600 } },
            { priceRoomDay: { $exists: true, $ne: 0, $gte: 600 } },
            { priceWholeDay: { $exists: true, $ne: 0, $gte: 600 } },
            { priceWholeMonth: { $exists: true, $ne: 0, $gte: 600 } }
          ]
        }
      ],
      category: /office/i
    };

    console.log('Query:', JSON.stringify(testQuery, null, 2));
    const results = await Listing.find(testQuery).limit(10).lean();
    console.log(`\nResults: ${results.length} listings found`);
    
    if (results.length > 0) {
      results.forEach(listing => {
        console.log(`  - ${listing.venue || listing.title}`);
        console.log(`    Category: ${listing.category}`);
        console.log(`    Price: ₱${listing.priceSeatDay || listing.priceSeatHour || listing.priceWholeDay || 0}`);
      });
    } else {
      console.log('  No results found. Trying without category filter...\n');
      
      const withoutCategory = await Listing.find({
        status: 'active',
        $or: [
          { priceSeatDay: { $exists: true, $ne: 0, $gte: 600 } },
          { priceSeatHour: { $exists: true, $ne: 0, $gte: 600 } },
          { priceWholeDay: { $exists: true, $ne: 0, $gte: 600 } },
        ]
      }).limit(5).lean();
      
      console.log(`  Found ${withoutCategory.length} listings with price >= 600 (any category)`);
      withoutCategory.forEach(listing => {
        console.log(`    - ${listing.venue || listing.title} (${listing.category || 'no category'})`);
      });
    }
    console.log();

    // Suggest fixes
    console.log('=== Suggestions ===');
    if (totalActive === 0) {
      console.log('⚠ No active listings found. Create some listings first.');
    } else if (withPrices.length === 0) {
      console.log('⚠ No listings have price data. Add prices to your listings.');
    } else if (categories.filter(Boolean).length === 0) {
      console.log('⚠ No listings have categories. Add categories to your listings.');
    } else {
      console.log('✓ Data looks good. The search should work.');
      console.log('  Try searching with:');
      console.log(`  - minPrice: 0-${Math.max(...withPrices.map(l => l.priceSeatDay || l.priceSeatHour || l.priceWholeDay || 0))}`);
      console.log(`  - category: ${categories.filter(Boolean)[0] || 'any'}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

debugSearch().catch(console.error);
