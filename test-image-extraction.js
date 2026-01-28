// Test image extraction from API response
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

async function testImageExtraction() {
  console.log('\n=== Testing Image Extraction ===\n');

  try {
    const res = await axios.get(`${API_BASE}/listings/search?minPrice=600`);
    
    console.log(`Found ${res.data.count} listings\n`);
    
    res.data.items.forEach(item => {
      console.log(`\n📍 ${item.venue || item.title}`);
      console.log(`   ID: ${item.id}`);
      
      // Check cover field
      if (item.cover) {
        console.log(`   ✓ Has cover: ${item.cover}`);
      }
      
      // Check photosMeta array
      if (Array.isArray(item.photosMeta) && item.photosMeta.length > 0) {
        console.log(`   ✓ Has photosMeta: ${item.photosMeta.length} photos`);
        console.log(`   Cover Index: ${item.coverIndex || 0}`);
        
        const coverIndex = item.coverIndex || 0;
        const photo = item.photosMeta[coverIndex] || item.photosMeta[0];
        
        if (photo) {
          const imageUrl = photo.url || photo.path;
          console.log(`   📸 Image URL: ${imageUrl ? imageUrl.substring(0, 60) + '...' : 'NONE'}`);
          
          if (!imageUrl) {
            console.log(`   ⚠️  Photo object exists but no url/path:`);
            console.log(`      Keys: ${Object.keys(photo).join(', ')}`);
          }
        }
      } else {
        console.log(`   ⚠️  No photosMeta array`);
      }
      
      // Check images array
      if (Array.isArray(item.images) && item.images.length > 0) {
        console.log(`   ✓ Has images array: ${item.images.length} images`);
        console.log(`   First image: ${item.images[0]}`);
      }
      
      // Determine final image
      let finalImage = null;
      if (item.cover) {
        finalImage = item.cover;
      } else if (Array.isArray(item.photosMeta) && item.photosMeta.length > 0) {
        const coverIndex = item.coverIndex || 0;
        const photo = item.photosMeta[coverIndex] || item.photosMeta[0];
        finalImage = photo?.url || photo?.path || null;
      } else if (Array.isArray(item.images) && item.images.length > 0) {
        finalImage = item.images[0];
      }
      
      console.log(`   ${finalImage ? '✅' : '❌'} Final Image: ${finalImage || 'NONE'}`);
    });

    console.log('\n✅ Image extraction test complete\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testImageExtraction();
