// test-rating-validation-unit.js
// Unit test for rating bounds validation logic

console.log('=================================================');
console.log('   Rating Bounds Validation Unit Tests');
console.log('=================================================');

// Test the validation logic
function validateRating(rating) {
  // Rating is required
  if (rating === undefined || rating === null) {
    return { valid: false, error: "Rating is required." };
  }

  // Reject non-numeric types (booleans, objects, arrays)
  if (typeof rating === 'boolean' || typeof rating === 'object') {
    return { valid: false, error: "Rating must be an integer between 1 and 5." };
  }

  const ratingNum = Number(rating);
  
  // Check if it's an integer
  if (!Number.isInteger(ratingNum)) {
    return { valid: false, error: "Rating must be an integer between 1 and 5." };
  }
  
  // Check bounds
  if (ratingNum < 1 || ratingNum > 5) {
    return { valid: false, error: "Rating must be between 1 and 5." };
  }

  return { valid: true };
}

// Test cases
const testCases = [
  // Valid ratings
  { input: 1, expected: true, description: 'Valid rating: 1' },
  { input: 2, expected: true, description: 'Valid rating: 2' },
  { input: 3, expected: true, description: 'Valid rating: 3' },
  { input: 4, expected: true, description: 'Valid rating: 4' },
  { input: 5, expected: true, description: 'Valid rating: 5' },
  
  // Invalid bounds
  { input: 0, expected: false, description: 'Invalid rating: 0 (below minimum)' },
  { input: 6, expected: false, description: 'Invalid rating: 6 (above maximum)' },
  { input: -1, expected: false, description: 'Invalid rating: -1 (negative)' },
  { input: 10, expected: false, description: 'Invalid rating: 10 (too high)' },
  { input: 100, expected: false, description: 'Invalid rating: 100 (way too high)' },
  
  // Non-integers
  { input: 3.5, expected: false, description: 'Invalid rating: 3.5 (decimal)' },
  { input: 4.2, expected: false, description: 'Invalid rating: 4.2 (decimal)' },
  { input: 2.9, expected: false, description: 'Invalid rating: 2.9 (decimal)' },
  
  // String numbers (should be converted)
  { input: '3', expected: true, description: 'Valid rating: "3" (string integer)' },
  { input: '5', expected: true, description: 'Valid rating: "5" (string integer)' },
  
  // Invalid types
  { input: 'five', expected: false, description: 'Invalid rating: "five" (string)' },
  { input: 'invalid', expected: false, description: 'Invalid rating: "invalid" (string)' },
  { input: null, expected: false, description: 'Invalid rating: null' },
  { input: undefined, expected: false, description: 'Invalid rating: undefined' },
  { input: NaN, expected: false, description: 'Invalid rating: NaN' },
  { input: {}, expected: false, description: 'Invalid rating: {} (object)' },
  { input: [], expected: false, description: 'Invalid rating: [] (array)' },
  { input: true, expected: false, description: 'Invalid rating: true (boolean)' },
  { input: false, expected: false, description: 'Invalid rating: false (boolean)' },
];

let passed = 0;
let failed = 0;

console.log('\n=== Running Test Cases ===\n');

testCases.forEach((testCase, index) => {
  const result = validateRating(testCase.input);
  const actualValid = result.valid;
  const expectedValid = testCase.expected;
  
  if (actualValid === expectedValid) {
    console.log(`✓ Test ${index + 1}: ${testCase.description}`);
    if (!actualValid) {
      console.log(`  Error message: "${result.error}"`);
    }
    passed++;
  } else {
    console.log(`✗ Test ${index + 1}: ${testCase.description}`);
    console.log(`  Expected: ${expectedValid ? 'valid' : 'invalid'}`);
    console.log(`  Got: ${actualValid ? 'valid' : 'invalid'}`);
    if (result.error) {
      console.log(`  Error message: "${result.error}"`);
    }
    failed++;
  }
});

console.log('\n=================================================');
console.log(`   Results: ${passed} passed, ${failed} failed`);
console.log('=================================================');

if (failed > 0) {
  process.exit(1);
}
