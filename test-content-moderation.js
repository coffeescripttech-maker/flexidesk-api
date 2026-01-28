/**
 * Test Content Moderation Service
 * Tests content validation rules
 */

const ContentModerationService = require('./src/services/ContentModerationService');

console.log('=== Testing Content Moderation Service ===\n');

// Test 1: Valid content
console.log('Test 1: Valid content');
const validContent = 'This is a great workspace with excellent amenities and friendly staff.';
const result1 = ContentModerationService.checkContent(validContent);
console.log('Content:', validContent);
console.log('Result:', JSON.stringify(result1, null, 2));
console.log('Expected: No violations');
console.log('✓ Pass:', !result1.hasViolations);
console.log('');

// Test 2: Too short content
console.log('Test 2: Too short content');
const shortContent = 'Good';
const result2 = ContentModerationService.checkContent(shortContent);
console.log('Content:', shortContent);
console.log('Result:', JSON.stringify(result2, null, 2));
console.log('Expected: Should reject (too_short)');
console.log('✓ Pass:', result2.shouldReject && result2.violations.some(v => v.type === 'too_short'));
console.log('');

// Test 3: Content with profanity
console.log('Test 3: Content with profanity');
const profaneContent = 'This place is damn terrible and the service sucks badly.';
const result3 = ContentModerationService.checkContent(profaneContent);
console.log('Content:', profaneContent);
console.log('Result:', JSON.stringify(result3, null, 2));
console.log('Expected: Should auto-flag (profanity)');
console.log('✓ Pass:', result3.shouldAutoFlag && result3.violations.some(v => v.type === 'profanity'));
console.log('');

// Test 4: Content with external links
console.log('Test 4: Content with external links');
const linkContent = 'Great space! Check out my website at https://example.com for more info.';
const result4 = ContentModerationService.checkContent(linkContent);
console.log('Content:', linkContent);
console.log('Result:', JSON.stringify(result4, null, 2));
console.log('Expected: Should auto-flag (external_links)');
console.log('✓ Pass:', result4.shouldAutoFlag && result4.violations.some(v => v.type === 'external_links'));
console.log('');

// Test 5: Content with www link
console.log('Test 5: Content with www link');
const wwwContent = 'Visit www.mysite.com for more details about this workspace.';
const result5 = ContentModerationService.checkContent(wwwContent);
console.log('Content:', wwwContent);
console.log('Result:', JSON.stringify(result5, null, 2));
console.log('Expected: Should auto-flag (external_links)');
console.log('✓ Pass:', result5.shouldAutoFlag && result5.violations.some(v => v.type === 'external_links'));
console.log('');

// Test 6: Content with email address
console.log('Test 6: Content with email address');
const emailContent = 'Great workspace! Contact me at john.doe@example.com for questions.';
const result6 = ContentModerationService.checkContent(emailContent);
console.log('Content:', emailContent);
console.log('Result:', JSON.stringify(result6, null, 2));
console.log('Expected: Should auto-flag (contact_info)');
console.log('✓ Pass:', result6.shouldAutoFlag && result6.violations.some(v => v.type === 'contact_info'));
console.log('');

// Test 7: Content with phone number (format 1)
console.log('Test 7: Content with phone number (format 1)');
const phoneContent1 = 'Call me at 555-123-4567 if you have any questions about this place.';
const result7 = ContentModerationService.checkContent(phoneContent1);
console.log('Content:', phoneContent1);
console.log('Result:', JSON.stringify(result7, null, 2));
console.log('Expected: Should auto-flag (contact_info)');
console.log('✓ Pass:', result7.shouldAutoFlag && result7.violations.some(v => v.type === 'contact_info'));
console.log('');

// Test 8: Content with phone number (format 2)
console.log('Test 8: Content with phone number (format 2)');
const phoneContent2 = 'Text me at (555) 123-4567 for more information about availability.';
const result8 = ContentModerationService.checkContent(phoneContent2);
console.log('Content:', phoneContent2);
console.log('Result:', JSON.stringify(result8, null, 2));
console.log('Expected: Should auto-flag (contact_info)');
console.log('✓ Pass:', result8.shouldAutoFlag && result8.violations.some(v => v.type === 'contact_info'));
console.log('');

// Test 9: Content with phone number (format 3)
console.log('Test 9: Content with phone number (format 3)');
const phoneContent3 = 'My number is 5551234567 if you need to reach me directly.';
const result9 = ContentModerationService.checkContent(phoneContent3);
console.log('Content:', phoneContent3);
console.log('Result:', JSON.stringify(result9, null, 2));
console.log('Expected: Should auto-flag (contact_info)');
console.log('✓ Pass:', result9.shouldAutoFlag && result9.violations.some(v => v.type === 'contact_info'));
console.log('');

// Test 10: Multiple violations
console.log('Test 10: Multiple violations');
const multipleViolations = 'Bad place! Email me at test@test.com or visit www.example.com';
const result10 = ContentModerationService.checkContent(multipleViolations);
console.log('Content:', multipleViolations);
console.log('Result:', JSON.stringify(result10, null, 2));
console.log('Expected: Should auto-flag with multiple violations');
console.log('✓ Pass:', result10.shouldAutoFlag && result10.violations.length > 1);
console.log('');

// Test 11: Empty content
console.log('Test 11: Empty content');
const emptyContent = '';
const result11 = ContentModerationService.checkContent(emptyContent);
console.log('Content: (empty string)');
console.log('Result:', JSON.stringify(result11, null, 2));
console.log('Expected: Should reject (invalid_content or too_short)');
console.log('✓ Pass:', result11.shouldReject);
console.log('');

// Test 12: Null content
console.log('Test 12: Null content');
const result12 = ContentModerationService.checkContent(null);
console.log('Content: null');
console.log('Result:', JSON.stringify(result12, null, 2));
console.log('Expected: Should reject (invalid_content)');
console.log('✓ Pass:', result12.shouldReject);
console.log('');

console.log('=== All Content Validation Tests Complete ===');
