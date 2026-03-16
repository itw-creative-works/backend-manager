/**
 * TEST_EXTENDED_MODE warning — SSOT for consistent messaging
 * Used by: emulator.js (console + log file), runner.js (console)
 */
const EXTENDED_MODE_WARNING = [
  '⚠️⚠️⚠️  WARNING: TEST_EXTENDED_MODE IS TRUE  ⚠️⚠️⚠️',
  'External API calls (emails, SendGrid, etc.) are ENABLED!',
  'This will send real emails and make real API calls.',
];

module.exports = { EXTENDED_MODE_WARNING };
