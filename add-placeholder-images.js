/**
 * Add placeholder images to listings with photosMeta but no URLs
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

// High-quality workspace placeholder images from Unsplash
const WORKSPACE_IMAGES = {
  meeting: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80', // Modern meeting room
    'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=1200&q=80', // Conference room
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=80', // Meeting space
  ],
  office: [
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80', // Modern office
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80', // Office building interior
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&q=80', // Office workspace
  ],
  desk: [
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80', // Hot desk
    'https://images.unsplash.com/photo-1497366412874-3415097a27e7?w=1200&q=80', // Desk workspace
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&q=80', // Work desk
  ],
  cowork: [
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80', // Coworking space
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80', // Open office
    'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1200&q=80', // Coworking area
  ],
  private: [
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80', // Private office
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80', // Executive office
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&q=80', // Private workspace
  ],
  default: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80',
  ]
};

function getPlaceholderImage(category) {
  const images = WORKSPACE_IMAGES[category?.toLowerCase()] || WORKSPACE_IMAGES.default;
  return images[Math.floor(Math.random() * images.length)];
}

async function addPlaceholderImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Find all active listings
    const listings = await Listing.find({ status: 'active' });
    console.log(`Found ${listings.length} active listings\n`);

    let updated = 0;
    for (const listing of listings) {
      let needsUpdate = false;
      
      // Check if photosMeta exists but has no URLs
      if (Array.isArray(listing.photosMeta) && listing.photosMeta.length > 0) {
        const hasUrls = listing.photosMeta.some(photo => photo.url || photo.path);
        
        if (!hasUrls) {
          // Add placeholder URL to the first photo
          const placeholderUrl = getPlaceholderImage(listing.category);
          listing.photosMeta[0] = {
            ...listing.photosMeta[0],
            url: placeholderUrl,
            path: placeholderUrl,
            publicId: 'placeholder'
          };
          needsUpdate = true;
          console.log(`✓ Added placeholder to: ${listing.venue || listing.title || listing._id}`);
          console.log(`  Category: ${listing.category}`);
          console.log(`  Image: ${placeholderUrl.substring(0, 60)}...`);
        }
      } else if (!listing.photosMeta || listing.photosMeta.length === 0) {
        // No photosMeta at all, create one with placeholder
        const placeholderUrl = getPlaceholderImage(listing.category);
        listing.photosMeta = [{
          name: 'placeholder.jpg',
          size: 0,
          type: 'image/jpeg',
          url: placeholderUrl,
          path: placeholderUrl,
          publicId: 'placeholder'
        }];
        listing.coverIndex = 0;
        needsUpdate = true;
        console.log(`✓ Created photosMeta for: ${listing.venue || listing.title || listing._id}`);
        console.log(`  Category: ${listing.category}`);
        console.log(`  Image: ${placeholderUrl.substring(0, 60)}...`);
      }
      
      if (needsUpdate) {
        await listing.save();
        updated++;
      }
    }

    console.log(`\n✅ Successfully updated ${updated} listings with placeholder images`);
    console.log('\nNote: These are placeholder images from Unsplash.');
    console.log('Owners should upload actual workspace photos through the UI.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

addPlaceholderImages();
