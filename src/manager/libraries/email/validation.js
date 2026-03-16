/**
 * Email validation — single entry point for all email quality checks
 *
 * Available checks (run in this order):
 * - format     — basic email regex
 * - disposable — checks against known disposable domain list
 * - localPart  — blocks spam/junk local parts (test, noreply, all-numeric, etc.)
 * - mailbox  — verifies mailbox exists via API (costs money, requires ZEROBOUNCE_API_KEY)
 *
 * Usage:
 *   validate(email)                                          // All free checks (format + disposable + localPart)
 *   validate(email, { checks: ['format', 'disposable'] })    // Only format + disposable
 *   validate(email, { checks: ALL_CHECKS })                  // Everything including mailbox
 *
 * Used by:
 * - routes/marketing/contact/post.js
 * - functions/core/actions/api/general/add-marketing-contact.js
 * - routes/user/signup/post.js (disposable check only)
 */
const fetch = require('wonderful-fetch');
const path = require('path');

// Load disposable domains list once at module level
const DISPOSABLE_DOMAINS = require(path.join(__dirname, '..', 'disposable-domains.json'));
const DISPOSABLE_SET = new Set(DISPOSABLE_DOMAINS.map(d => d.toLowerCase()));

// Spam/junk local parts — exact matches (checked after stripping +suffix)
const BLOCKED_LOCAL_PARTS = new Set([
  // Generic/test
  'test', 'testing', 'tester', 'test1', 'test123',
  'example', 'sample', 'demo', 'dummy', 'fake', 'temp',
  // System/role addresses
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'webmaster', 'hostmaster',
  'abuse', 'spam', 'root',
  // Keyboard walks / junk
  'asdf', 'qwerty', 'zxcv', 'asd', 'qwe',
  'aaa', 'bbb', 'xxx', 'zzz',
  'abc', 'abc123', 'abcdef',
  // Placeholder
  'user', 'email', 'mail', 'hello', 'info',
  'admin', 'administrator', 'support',
  'contact', 'name', 'firstname', 'lastname',
  'foo', 'bar', 'baz', 'foobar',
  'null', 'undefined', 'none', 'anonymous',
]);

// Patterns that indicate junk local parts (checked after stripping +suffix)
const BLOCKED_LOCAL_PATTERNS = [
  /^\d+$/,           // All numeric: 123456
  /^(.)\1{2,}$/,     // Repeating single char: aaaa, xxxx
  /^[a-z]{1,2}\d+$/, // Single letter + numbers: a123, x999
  /^test[._-]/,      // Starts with test separator: test.user, test_123
];

// Format regex
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default checks (all free checks — mailbox excluded because it costs money)
const DEFAULT_CHECKS = ['format', 'disposable', 'localPart'];

// All available checks
const ALL_CHECKS = ['format', 'disposable', 'localPart', 'mailbox'];

/**
 * Validate an email address through selected checks.
 *
 * Returns valid: true on mailbox API errors so emails are never silently dropped.
 *
 * @param {string} email
 * @param {object} [options]
 * @param {Array<string>} [options.checks] - Which checks to run (default: DEFAULT_CHECKS)
 * @returns {{ valid: boolean, checks: { format?: object, disposable?: object, localPart?: object, mailbox?: object } }}
 */
async function validate(email, options = {}) {
  const checks = new Set(options.checks || DEFAULT_CHECKS);
  const result = { valid: true, checks: {} };

  // 1. Format
  if (checks.has('format')) {
    if (!email || !EMAIL_FORMAT.test(email)) {
      result.valid = false;
      result.checks.format = { valid: false, reason: 'Invalid email format' };
      return result;
    }

    result.checks.format = { valid: true };
  }

  const [rawLocalPart, domain] = (email || '').toLowerCase().split('@');

  // 2. Disposable domain
  if (checks.has('disposable') && domain) {
    if (DISPOSABLE_SET.has(domain)) {
      result.valid = false;
      result.checks.disposable = { valid: false, blocked: true, domain };
      return result;
    }

    result.checks.disposable = { valid: true, blocked: false };
  }

  // 3. Local part — strip +suffix before checking
  if (checks.has('localPart') && rawLocalPart) {
    const localPart = rawLocalPart.split('+')[0];

    if (BLOCKED_LOCAL_PARTS.has(localPart)) {
      result.valid = false;
      result.checks.localPart = { valid: false, blocked: true, localPart, reason: 'Blocked local part' };
      return result;
    }

    const blockedPattern = BLOCKED_LOCAL_PATTERNS.find((p) => p.test(localPart));

    if (blockedPattern) {
      result.valid = false;
      result.checks.localPart = { valid: false, blocked: true, localPart, reason: 'Matches junk pattern' };
      return result;
    }

    result.checks.localPart = { valid: true };
  }

  // 4. Mailbox verification (ZeroBounce)
  if (checks.has('mailbox')) {
    if (!process.env.ZEROBOUNCE_API_KEY) {
      result.checks.mailbox = { valid: true, skipped: true, reason: 'No API key' };
      return result;
    }

    try {
      const data = await fetch(
        `https://api.zerobounce.net/v2/validate?api_key=${process.env.ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
        { response: 'json', timeout: 10000 }
      );

      if (data.error) {
        console.error('ZeroBounce API error:', data.error);
        result.checks.mailbox = { valid: true, error: data.error };
        return result;
      }

      if (!data.status) {
        console.error('ZeroBounce unexpected response:', data);
        result.checks.mailbox = { valid: true, error: 'Unexpected response format' };
        return result;
      }

      const zbValid = data.status === 'valid';
      result.checks.mailbox = {
        valid: zbValid,
        status: data.status,
        subStatus: data.sub_status || null,
      };

      if (!zbValid) {
        result.valid = false;
      }
    } catch (e) {
      console.error('ZeroBounce validation error:', e);
      result.checks.mailbox = { valid: true, error: e.message };
    }
  }

  return result;
}

module.exports = { validate, DEFAULT_CHECKS, ALL_CHECKS };
