// Test to see raw listing data structure
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

async function testRawListing() {
  console.log('\n=== Testing Raw Listing Data ===\n');

  try {
    // Get Incub8 Space which should have images
    const res = await axios.get(`${API_BASE}/listings/69724066c632e19b7ccde167`);
    
    const listing = res.data.listing;
    
    console.log('Listing:', listing.venue || listing.title);
    console.log('\nphotosMeta array:');
    console.log(JSON.stringify(listing.photosMeta, null, 2));
    
    console.log('\nChecking for other image fields:');
    console.log('cover:', listing.cover);
    console.log('images:', listing.images);
    console.log('coverIndex:', listing.coverIndex);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testRawListing();
