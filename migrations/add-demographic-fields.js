/**
 * Migration: Add demographic fields to existing listings
 * 
 * This migration adds:
 * - idealFor: Array of target user types
 * - workStyle: Array of work styles supported
 * - industries: Array of industries served
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('../src/models/Listing');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexidesk';

async function addDemographicFields() {
  try {
    console.log('\n=== Adding Demographic Fields Migration ===\n');
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Find all listings
    const listings = await Listing.find({});
    console.log(`Found ${listings.length} listings to migrate\n`);

    let updated = 0;
    for (const listing of listings) {
      let needsUpdate = false;

      // Add idealFor if not exists
      if (!listing.idealFor || listing.idealFor.length === 0) {
        // Set default based on category
        const defaults = {
          'meeting': ['startups', 'small-business', 'consultants'],
          'office': ['startups', 'small-business', 'enterprise'],
          'desk': ['freelancers', 'students', 'remote-teams'],
          'private': ['enterprise', 'consultants', 'small-business'],
          'coworking': ['freelancers', 'startups', 'creative', 'tech'],
          'cowork': ['freelancers', 'startups', 'creative', 'tech']
        };
        
        listing.idealFor = defaults[listing.category?.toLowerCase()] || ['general'];
        needsUpdate = true;
      }

      // Add workStyle if not exists
      if (!listing.workStyle || listing.workStyle.length === 0) {
        // Set default based on noiseLevel and amenities
        const styles = [];
        
        if (listing.noiseLevel === 'quiet') {
          styles.push('focused');
        }
        if (listing.noiseLevel === 'lively') {
          styles.push('networking', 'social');
        }
        if (listing.amenities?.whiteboard || listing.amenities?.projector) {
          styles.push('collaborative', 'meetings');
        }
        if (listing.rooms > 0) {
          styles.push('meetings');
        }
        
        listing.workStyle = styles.length > 0 ? styles : ['flexible'];
        needsUpdate = true;
      }

      // Add industries if not exists (empty by default)
      if (!listing.industries) {
        listing.industries = [];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await listing.save();
        console.log(`✓ Updated: ${listing.venue || listing.title || listing._id}`);
        console.log(`  idealFor: ${listing.idealFor.join(', ')}`);
        console.log(`  workStyle: ${listing.workStyle.join(', ')}`);
        updated++;
      }
    }

    console.log(`\n✅ Successfully migrated ${updated} listings`);
    console.log('\nNew fields added:');
    console.log('- idealFor: Target user types (freelancers, students, startups, etc.)');
    console.log('- workStyle: Work styles supported (focused, collaborative, etc.)');
    console.log('- industries: Industries served (optional)');
    console.log('\nOwners can update these fields through the listing edit page.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed\n');
  }
}

addDemographicFields();
