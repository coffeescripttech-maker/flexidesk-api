/**
 * Test PhotoUploadService
 * 
 * This script tests the PhotoUploadService functionality including:
 * - Photo validation (count, size, format)
 * - Photo compression
 * - Upload to Cloudinary
 * - Delete from Cloudinary
 */

const PhotoUploadService = require('./src/services/PhotoUploadService');
const fs = require('fs');
const path = require('path');

// ANSI color codes for output
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

function logTest(testName, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  const color = passed ? 'green' : 'red';
  log(`${status}: ${testName}`, color);
  if (details) {
    console.log(`  ${details}`);
  }
}

// Test 1: Photo Validation - Count
async function testPhotoCountValidation() {
  logSection('Test 1: Photo Count Validation');
  
  // Test with 5 photos (valid)
  const validPhotos = Array(5).fill(null).map((_, i) => ({
    originalname: `photo${i}.jpg`,
    mimetype: 'image/jpeg',
    size: 1024 * 1024 // 1MB
  }));
  
  const validResult = PhotoUploadService.validatePhotos(validPhotos);
  logTest('5 photos should be valid', validResult.valid);
  
  // Test with 6 photos (invalid)
  const invalidPhotos = Array(6).fill(null).map((_, i) => ({
    originalname: `photo${i}.jpg`,
    mimetype: 'image/jpeg',
    size: 1024 * 1024
  }));
  
  const invalidResult = PhotoUploadService.validatePhotos(invalidPhotos);
  logTest('6 photos should be invalid', !invalidResult.valid && invalidResult.errors.length > 0);
  if (!invalidResult.valid) {
    console.log(`  Error: ${invalidResult.errors[0].message}`);
  }
}

// Test 2: Photo Validation - Size
async function testPhotoSizeValidation() {
  logSection('Test 2: Photo Size Validation');
  
  // Test with valid size (4MB)
  const validPhoto = [{
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 4 * 1024 * 1024 // 4MB
  }];
  
  const validResult = PhotoUploadService.validatePhotos(validPhoto);
  logTest('4MB photo should be valid', validResult.valid);
  
  // Test with invalid size (6MB)
  const invalidPhoto = [{
    originalname: 'large-photo.jpg',
    mimetype: 'image/jpeg',
    size: 6 * 1024 * 1024 // 6MB
  }];
  
  const invalidResult = PhotoUploadService.validatePhotos(invalidPhoto);
  logTest('6MB photo should be invalid', !invalidResult.valid && invalidResult.errors.length > 0);
  if (!invalidResult.valid) {
    console.log(`  Error: ${invalidResult.errors[0].message}`);
  }
}

// Test 3: Photo Validation - Format
async function testPhotoFormatValidation() {
  logSection('Test 3: Photo Format Validation');
  
  // Test valid formats
  const validFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  let allValid = true;
  
  for (const format of validFormats) {
    const photo = [{
      originalname: `photo.${format.split('/')[1]}`,
      mimetype: format,
      size: 1024 * 1024
    }];
    
    const result = PhotoUploadService.validatePhotos(photo);
    if (!result.valid) {
      allValid = false;
      console.log(`  ${format} failed validation`);
    }
  }
  
  logTest('Valid formats (JPEG, PNG, WEBP) should pass', allValid);
  
  // Test invalid format
  const invalidPhoto = [{
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: 1024 * 1024
  }];
  
  const invalidResult = PhotoUploadService.validatePhotos(invalidPhoto);
  logTest('PDF format should be invalid', !invalidResult.valid && invalidResult.errors.length > 0);
  if (!invalidResult.valid) {
    console.log(`  Error: ${invalidResult.errors[0].message}`);
  }
}

// Test 4: Photo Compression
async function testPhotoCompression() {
  logSection('Test 4: Photo Compression');
  
  try {
    // Create a simple test image buffer (1x1 pixel PNG)
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    const photo = {
      buffer: testImageBuffer,
      originalname: 'test.png',
      mimetype: 'image/png',
      size: testImageBuffer.length
    };
    
    const compressed = await PhotoUploadService.compressPhoto(photo);
    
    logTest('Photo compression should return a buffer', Buffer.isBuffer(compressed));
    logTest('Compressed buffer should have data', compressed.length > 0);
    console.log(`  Original size: ${testImageBuffer.length} bytes`);
    console.log(`  Compressed size: ${compressed.length} bytes`);
    
  } catch (error) {
    logTest('Photo compression', false, error.message);
  }
}

// Test 5: Extract Public ID from Cloudinary URL
async function testExtractPublicId() {
  logSection('Test 5: Extract Public ID from Cloudinary URL');
  
  const testCases = [
    {
      url: 'https://res.cloudinary.com/demo/image/upload/v1234567890/reviews/abc123/photo1.jpg',
      expected: 'reviews/abc123/photo1'
    },
    {
      url: 'https://res.cloudinary.com/demo/image/upload/reviews/abc123/photo2.png',
      expected: 'reviews/abc123/photo2'
    }
  ];
  
  let allPassed = true;
  
  for (const testCase of testCases) {
    const publicId = PhotoUploadService.extractPublicId(testCase.url);
    const passed = publicId === testCase.expected;
    
    if (!passed) {
      allPassed = false;
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Got: ${publicId}`);
    }
  }
  
  logTest('Extract public ID from Cloudinary URLs', allPassed);
}

// Test 6: Validation with Multiple Errors
async function testMultipleValidationErrors() {
  logSection('Test 6: Multiple Validation Errors');
  
  const photos = [
    {
      originalname: 'large.jpg',
      mimetype: 'image/jpeg',
      size: 6 * 1024 * 1024 // Too large
    },
    {
      originalname: 'wrong-format.pdf',
      mimetype: 'application/pdf',
      size: 1024 * 1024 // Wrong format
    },
    {
      originalname: 'valid.jpg',
      mimetype: 'image/jpeg',
      size: 2 * 1024 * 1024 // Valid
    }
  ];
  
  const result = PhotoUploadService.validatePhotos(photos);
  
  logTest('Should detect multiple validation errors', !result.valid && result.errors.length === 2);
  console.log(`  Errors found: ${result.errors.length}`);
  result.errors.forEach((error, i) => {
    console.log(`  ${i + 1}. ${error.file}: ${error.message}`);
  });
}

// Run all tests
async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║         PhotoUploadService Test Suite                     ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  try {
    await testPhotoCountValidation();
    await testPhotoSizeValidation();
    await testPhotoFormatValidation();
    await testPhotoCompression();
    await testExtractPublicId();
    await testMultipleValidationErrors();
    
    logSection('Test Summary');
    log('All validation and compression tests completed!', 'green');
    log('\nNote: Upload and delete tests require actual Cloudinary connection', 'yellow');
    log('and are tested separately in integration tests.', 'yellow');
    
  } catch (error) {
    log('\nTest suite failed with error:', 'red');
    console.error(error);
  }
}

// Run tests
runAllTests();
