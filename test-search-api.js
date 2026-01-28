/**
 * Test Search API via HTTP
 * Tests the actual API endpoint
 */

const http = require('http');

function testAPI(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function runTests() {
  console.log('=== Testing Search API ===\n');

  try {
    // Test 1: Get all active listings
    console.log('Test 1: Get all active listings');
    const all = await testAPI('/api/listings?status=active&limit=5');
    console.log(`  Status: ${all.status}`);
    console.log(`  Results: ${all.data.items?.length || 0} listings`);
    if (all.data.items?.length > 0) {
      const sample = all.data.items[0];
      console.log(`  Sample: ${sample.venue || sample.title}`);
      console.log(`    Category: ${sample.category || 'none'}`);
      console.log(`    priceSeatDay: ₱${sample.priceSeatDay || 0}`);
      console.log(`    priceSeatHour: ₱${sample.priceSeatHour || 0}`);
    }
    console.log();

    // Test 2: Search with minPrice only
    console.log('Test 2: Search with minPrice=600');
    const priceOnly = await testAPI('/api/listings/search?minPrice=600');
    console.log(`  Status: ${priceOnly.status}`);
    console.log(`  Results: ${priceOnly.data.items?.length || 0} listings`);
    if (priceOnly.data.items?.length > 0) {
      priceOnly.data.items.slice(0, 3).forEach(listing => {
        const price = listing.priceSeatDay || listing.priceSeatHour || listing.priceWholeDay || 0;
        console.log(`    - ${listing.venue || listing.title}: ₱${price}`);
      });
    }
    console.log();

    // Test 3: Search with category only
    console.log('Test 3: Search with category=office');
    const categoryOnly = await testAPI('/api/listings/search?category=office');
    console.log(`  Status: ${categoryOnly.status}`);
    console.log(`  Results: ${categoryOnly.data.items?.length || 0} listings`);
    if (categoryOnly.data.items?.length > 0) {
      categoryOnly.data.items.slice(0, 3).forEach(listing => {
        console.log(`    - ${listing.venue || listing.title} (${listing.category})`);
      });
    }
    console.log();

    // Test 4: Search with both filters
    console.log('Test 4: Search with minPrice=600&category=office');
    const both = await testAPI('/api/listings/search?minPrice=600&category=office');
    console.log(`  Status: ${both.status}`);
    console.log(`  Results: ${both.data.items?.length || 0} listings`);
    if (both.data.items?.length > 0) {
      both.data.items.forEach(listing => {
        const price = listing.priceSeatDay || listing.priceSeatHour || listing.priceWholeDay || 0;
        console.log(`    - ${listing.venue || listing.title}: ₱${price} (${listing.category})`);
      });
    }
    console.log();

    // Summary
    console.log('=== Summary ===');
    console.log(`Total listings: ${all.data.items?.length || 0}`);
    console.log(`With price >= 600: ${priceOnly.data.item