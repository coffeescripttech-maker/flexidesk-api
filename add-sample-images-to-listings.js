/**
 * Add sample images to listings that don't have any
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

// Sample placeholder images (you can replace these with real Cloudinary URLs)
const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800', // Office space
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800', // Modern office
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800', // Coworking space
  'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800', // Workspace
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800', // Building
];

async function addSampleImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Find all listings without images
    const listings = await Listing.find({
      $or: [
        { images: { $exists: false } },
        { images: { $size: 0 } },
        { images: null }
      ]
    });

    console.log(`Found ${listings.length} listings without images\n`);

    if (listings.length === 0) {
      console.log('All listings already have images!');
      return;
    }

    let updated = 0;
    for (const listing of listings) {
      // Pick a random sample image
      const randomImage = SAMPLE_IMAGES[Math.floor(Math.random() * SAMPLE_IMAGES.length)];
      
      // Update the listing
      listing.images = [randomImage];
      listing.cover = randomImage;
      await listing.save();

      console.log(`✓ Updated listing: ${listing.title || listing.venue || listing._id}`);
      console.log(`  Image: ${randomImage}`);
      updated++;
    }

    console.log(`\n✅ Successfully updated ${updated} listings with sample images`);
    console.log('\nNote: These are placeholder images from Unsplash.');
    console.log('Replace them with actual workspace photos for production.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

addSampleImages();
