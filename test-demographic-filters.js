// Test demographic filtering
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

async function testDemographicFilters() {
  console.log('\n=== Testing Demographic Filters ===\n');

  try {
    // Test 1: Filter by idealFor
    console.log('Test 1: idealFor=freelancers');
    const res1 = await axios.get(`${API_BASE}/listings/search?idealFor=freelancers`);
    console.log(`Found ${res1.data.count} listings for freelancers`);
    res1.data.items.slice(0, 3).forEach(item => {
      console.log(`  - ${item.venue}: ${item.idealFor?.join(', ') || 'none'}`);
    });

    // Test 2: Filter by workStyle
    console.log('\nTest 2: workStyle=focused');
    const res2 = await axios.get(`${API_BASE}/listings/search?workStyle=focused`);
    console.log(`Found ${res2.data.count} listings for focused work`);
    res2.data.items.slice(0, 3).forEach(item => {
      console.log(`  - ${item.venue}: ${item.workStyle?.join(', ') || 'none'}`);
    });

    // Test 3: Filter by noiseLevel
    console.log('\nTest 3: noiseLevel=quiet');
    const res3 = await axios.get(`${API_BASE}/listings/search?noiseLevel=quiet`);
    console.log(`Found ${res3.data.count} quiet listings`);
    res3.data.items.slice(0, 3).forEach(item => {
      console.log(`  - ${item.venue}: ${item.noiseLevel}`);
    });

    // Test 4: Combined demographic filters
    console.log('\nTest 4: idealFor=freelancers&workStyle=focused&noiseLevel=quiet');
    const res4 = await axios.get(`${API_BASE}/listings/search?idealFor=freelancers&workStyle=focused&noiseLevel=quiet`);
    console.log(`Found ${res4.data.count} listings matching all criteria`);
    res4.data.items.forEach(item => {
      console.log(`  - ${item.venue}`);
      console.log(`    Ideal for: ${item.idealFor?.join(', ') || 'none'}`);
      console.log(`    Work style: ${item.workStyle?.join(', ') || 'none'}`);
      console.log(`    Noise: ${item.noiseLevel}`);
    });

    // Test 5: Combined with price and category
    console.log('\nTest 5: category=cowork&idealFor=freelancers&minPrice=300&maxPrice=700');
    const res5 = await axios.get(`${API_BASE}/listings/search?category=cowork&idealFor=freelancers&minPrice=300&maxPrice=700`);
    console.log(`Found ${res5.data.count} coworking spaces for freelancers in price range`);
    res5.data.items.forEach(item => {
      console.log(`  - ${item.venue}: ₱${item.priceSeatDay}/day`);
    });

    console.log('\n✅ Demographic filter tests complete\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testDemographicFilters();
