// Test daily price filtering
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

async function testDailyPriceFilter() {
  console.log('\n=== Testing Daily Price Filter ===\n');

  try {
    // Test 1: Filter with minPrice=600 (should only return listings with daily rates >= 600)
    console.log('Test 1: minPrice=600');
    const res1 = await axios.get(`${API_BASE}/listings/search?minPrice=600`);
    console.log(`Found ${res1.data.count} listings`);
    
    res1.data.items.forEach(item => {
      console.log(`\n- ${item.venue || item.title}`);
      console.log(`  Category: ${item.category}`);
      console.log(`  Seat/Day: ₱${item.priceSeatDay || 'N/A'}`);
      console.log(`  Seat/Hour: ₱${item.priceSeatHour || 'N/A'}`);
      console.log(`  Room/Day: ₱${item.priceRoomDay || 'N/A'}`);
      console.log(`  Whole/Day: ₱${item.priceWholeDay || 'N/A'}`);
      
      // Verify daily rates meet minimum
      const dailyRates = [
        item.priceSeatDay,
        item.priceRoomDay,
        item.priceWholeDay
      ].filter(p => p && p > 0);
      
      const meetsMin = dailyRates.some(rate => rate >= 600);
      console.log(`  ✓ Meets minPrice=600: ${meetsMin ? 'YES' : 'NO'}`);
    });

    // Test 2: Filter with minPrice=600&maxPrice=1000
    console.log('\n\nTest 2: minPrice=600&maxPrice=1000');
    const res2 = await axios.get(`${API_BASE}/listings/search?minPrice=600&maxPrice=1000`);
    console.log(`Found ${res2.data.count} listings`);
    
    res2.data.items.forEach(item => {
      console.log(`\n- ${item.venue || item.title}`);
      const dailyRates = [
        item.priceSeatDay,
        item.priceRoomDay,
        item.priceWholeDay
      ].filter(p => p && p > 0);
      
      console.log(`  Daily rates: ${dailyRates.join(', ')}`);
      const inRange = dailyRates.some(rate => rate >= 600 && rate <= 1000);
      console.log(`  ✓ In range 600-1000: ${inRange ? 'YES' : 'NO'}`);
    });

    console.log('\n✅ Daily price filter test complete\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testDailyPriceFilter();
