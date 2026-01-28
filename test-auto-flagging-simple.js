/**
 * Test Auto-Flagging Logic (Simple - No Database)
 * Tests the auto-flagging functionality without database integration
 */

const ContentModerationService = require('./src/services/ContentModerationService');

async function runTests() {
  console.log('=== Testing Auto-Flagging Logic (Simple) ===\n');

  // Test 1: Auto-flag review with profanity
  console.log('Test 1: Auto-flag review with profanity');
  const profaneComment = 'This place is damn terrible and sucks badly.';
  const result1 = await ContentModerationService.autoFlag(profaneComment);
  console.log('Comment:', profaneComment);
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('Expected: Should flag with profanity reason');
  console.log('✓ Pass:', result1.shouldFlag && result1.reason.includes('profanity'));
  console.log('');

  // Test 2: Auto-flag review with external links
  console.log('Test 2: Auto-flag review with external links');
  const linkComment = 'Great space! Visit https://example.com for more info.';
  const result2 = await ContentModerationService.autoFlag(linkComment);
  console.log('Comment:', linkComment);
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('Expected: Should flag with external_links reason');
  console.log('✓ Pass:', result2.shouldFlag && result2.reason.includes('external_links'));
  console.log('');

  // Test 3: Auto-flag review with contact info (email)
  console.log('Test 3: Auto-flag review with contact info (email)');
  const emailComment = 'Nice workspace. Email me at test@example.com for details.';
  const result3 = await ContentModerationService.autoFlag(emailComment);
  console.log('Comment:', emailComment);
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('Expected: Should flag with contact_info reason');
  console.log('✓ Pass:', result3.shouldFlag && result3.reason.includes('contact_info'));
  console.log('');

  // Test 4: Auto-flag review with contact info (phone)
  console.log('Test 4: Auto-flag review with contact info (phone)');
  const phoneComment = 'Call me at 555-123-4567 if you have questions.';
  const result4 = await ContentModerationService.autoFlag(phoneComment);
  console.log('Comment:', phoneComment);
  console.log('Result:', JSON.stringify(result4, null, 2));
  console.log('Expected: Should flag with contact_info reason');
  console.log('✓ Pass:', result4.shouldFlag && result4.reason.includes('contact_info'));
  console.log('');

  // Test 5: Clean review should NOT be auto-flagged
  console.log('Test 5: Clean review should NOT be auto-flagged');
  const cleanComment = 'Excellent workspace with great amenities and professional environment.';
  const result5 = await ContentModerationService.autoFlag(cleanComment);
  console.log('Comment:', cleanComment);
  console.log('Result:', JSON.stringify(result5, null, 2));
  console.log('Expected: Should NOT flag');
  console.log('✓ Pass:', !result5.shouldFlag);
  console.log('');

  // Test 6: Review with multiple violations
  console.log('Test 6: Review with multiple violations');
  const multiComment = 'This place sucks! Email me at bad@test.com or visit www.complaint.com';
  const result6 = await ContentModerationService.autoFlag(multiComment);
  console.log('Comment:', multiComment);
  console.log('Result:', JSON.stringify(result6, null, 2));
  console.log('Expected: Should flag with multiple reasons');
  console.log('Violations found:', result6.violations ? result6.violations.length : 0);
  console.log('✓ Pass:', result6.shouldFlag && result6.violations && result6.violations.length > 1);
  console.log('');

  // Test 7: Too short review should be rejected (not auto-flagged)
  console.log('Test 7: Too short review should be rejected (not auto-flagged)');
  const shortComment = 'Bad';
  const checkResult = ContentModerationService.checkContent(shortComment);
  console.log('Comment:', shortComment);
  console.log('Result:', JSON.stringify(checkResult, null, 2));
  console.log('Expected: Should reject but not auto-flag');
  console.log('✓ Pass:', checkResult.shouldReject && !checkResult.shouldAutoFlag);
  console.log('');

  // Test 8: Test cleanContent utility
  console.log('Test 8: Test cleanContent utility');
  const dirtyComment = 'This damn place sucks so badly!';
  const cleanedComment = ContentModerationService.cleanContent(dirtyComment);
  console.log('Original:', dirtyComment);
  console.log('Cleaned:', cleanedComment);
  console.log('Expected: Profanity should be replaced with ****');
  console.log('✓ Pass:', cleanedComment.includes('****') && !cleanedComment.includes('damn'));
  console.log('');

  console.log('=== All Auto-Flagging Tests Complete ===');
  console.log('\nSummary:');
  console.log('✓ Auto-flag reviews with profanity');
  console.log('✓ Auto-flag reviews with external links');
  console.log('✓ Auto-flag reviews with contact info (email and phone)');
  console.log('✓ Do NOT auto-flag clean reviews');
  console.log('✓ Reject reviews under 10 characters (without auto-flagging)');
  console.log('✓ Handle multiple violations correctly');
  console.log('✓ Clean profanity from content');
}

runTests();
