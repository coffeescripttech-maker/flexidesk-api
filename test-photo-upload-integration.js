/**
 * Integration Test: PhotoUploadService with Cloudinary
 * 
 * This script tests actual upload and delete operations with Cloudinary.
 * Requires valid Cloudinary credentials in .env file.
 */

require('dotenv').config();
const PhotoUploadService = require('./src/services/PhotoUploadService');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

// Create a test image buffer (1x1 pixel PNG)
function createTestImage() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

async function testUploadAndDelete() {
  logSection('Integration Test: Upload and Delete Photos');
  
  try {
    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      log('⚠ Cloudinary credentials not found in .env', 'yellow');
      log('Skipping integration test', 'yellow');
      return;
    }
    
    log('✓ Cloudinary credentials found', 'green');
    console.log(`  Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
    
    // Create test photos
    const testPhotos = [
      {
        buffer: createTestImage(),
        originalname: 'test-photo-1.png',
        mimetype: 'image/png',
        size: createTestImage().length
      },
      {
        buffer: createTestImage(),
        originalname: 'test-photo-2.png',
        mimetype: 'image/png',
        size: createTestImage().length
      }
    ];
    
    log('\n📤 Uploading test photos...', 'blue');
    const reviewId = 'test-review-' + Date.now();
    const uploadResult = await PhotoUploadService.uploadPhotos(testPhotos, reviewId);
    
    if (uploadResult.errors.length > 0) {
      log('✗ Upload failed with errors:', 'red');
      uploadResult.errors.forEach(err => {
        console.log(`  - ${err.file}: ${err.error}`);
      });
      return;
    }
    
    log(`✓ Successfully uploaded ${uploadResult.urls.length} photos`, 'green');
    uploadResult.urls.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    
    // Test delete
    log('\n🗑️  Deleting uploaded photos...', 'blue');
    const deleteResult = await PhotoUploadService.deletePhotos(uploadResult.urls);
    
    if (deleteResult.errors.length > 0) {
      log('✗ Delete failed with errors:', 'red');
      deleteResult.errors.forEach(err => {
        console.log(`  - ${err.url}: ${err.error}`);
      });
    } else {
      log(`✓ Successfully deleted ${deleteResult.deleted.length} photos`, 'green');
    }
    
    logSection('Integration Test Summary');
    log('✓ Upload and delete operations completed successfully!', 'green');
    
  } catch (error) {
    log('\n✗ Integration test failed:', 'red');
    console.error(error);
  }
}

// Run integration test
async function runIntegrationTest() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║    PhotoUploadService Integration Test (Cloudinary)       ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  await testUploadAndDelete();
}

runIntegrationTest();
