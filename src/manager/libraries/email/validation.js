/**
 * Email validation — single entry point for all email quality checks
 *
 * Available checks (run in this order):
 * - format     — basic email regex
 * - disposable — checks against known disposable domain list
 * - corporate  — blocks corporate/social-media domains (meta.com, instagram.com, soundcloud.com, etc.)
 * - localPart  — blocks spam/junk local parts (test, noreply, all-numeric, etc.)
 * - mailbox  — verifies mailbox exists via API (costs money, requires ZEROBOUNCE_API_KEY)
 *
 * Usage:
 *   validate(email)                                          // All free checks (format + disposable + corporate + localPart)
 *   validate(email, { checks: ['format', 'disposable'] })    // Only format + disposable
 *   validate(email, { checks: ALL_CHECKS })                  // Everything including mailbox
 *
 * Used by:
 * - routes/marketing/contact/post.js
 * - functions/core/actions/api/general/add-marketing-contact.js
 * - routes/user/signup/post.js (disposable check only)
 * - libraries/email/marketing/index.js (safety net before Beehiiv/SendGrid add/sync)
 */
const fetch = require('wonderful-fetch');
const path = require('path');

// All data lives in ./data/ — domains and local-part blocklists are co-located JSON files.
const DATA_DIR = path.join(__dirname, 'data');

// Load disposable domains: curated vendor list + custom additions
const DISPOSABLE_DOMAINS = require(path.join(DATA_DIR, 'disposable-domains.json'));
const CUSTOM_DISPOSABLE_DOMAINS = require(path.join(DATA_DIR, 'custom-disposable-domains.json'));
const DISPOSABLE_SET = new Set([
  ...DISPOSABLE_DOMAINS.map(d => d.toLowerCase()),
  ...CUSTOM_DISPOSABLE_DOMAINS.map(d => d.toLowerCase()),
]);

// Load corporate/social-media domains — real mailboxes we never want on marketing lists
const CORPORATE_DOMAINS = require(path.join(DATA_DIR, 'corporate-domains.json'));
const CORPORATE_SET = new Set(CORPORATE_DOMAINS.map(d => d.toLowerCase()));

// Load local-part blocklists from ./data/ (JSON for strings, JS for regex patterns)
const BLOCKED_LOCAL_PARTS_DATA = require(path.join(DATA_DIR, 'blocked-local-parts.json'));
const BLOCKED_LOCAL_PARTS = new Set(
  Object.values(BLOCKED_LOCAL_PARTS_DATA).flat().map(p => p.toLowerCase())
);
const BLOCKED_LOCAL_PATTERNS = require(path.join(DATA_DIR, 'blocked-local-patterns.js'));

// Format regex
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default checks (all free checks — mailbox excluded because it costs money)
const DEFAULT_CHECKS = ['format', 'disposable', 'corporate', 'localPart'];

// All available checks
const ALL_CHECKS = ['format', 'disposable', 'corporate', 'localPart', 'mailbox'];

/**
 * Validate an email address through selected checks.
 *
 * Returns valid: true on mailbox API errors so emails are never silently dropped.
 *
 * @param {string} email
 * @param {object} [options]
 * @param {Array<string>} [options.checks] - Which checks to run (default: DEFAULT_CHECKS)
 * @returns {{ valid: boolean, checks: { format?: object, disposable?: object, corporate?: object, localPart?: object, mailbox?: object } }}
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

  // 3. Corporate / social-media domain (real mailbox, but never wanted on marketing lists)
  if (checks.has('corporate') && domain) {
    if (CORPORATE_SET.has(domain)) {
      result.valid = false;
      result.checks.corporate = { valid: false, blocked: true, domain, reason: 'Corporate/social-media domain' };
      return result;
    }

    result.checks.corporate = { valid: true, blocked: false };
  }

  // 4. Local part — strip +suffix before checking
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

  // 5. Mailbox verification (ZeroBounce)
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

/**
 * Quick check: is this email from a disposable domain?
 * Works with a full email address or just a domain.
 *
 * @param {string} emailOrDomain
 * @returns {boolean}
 */
function isDisposable(emailOrDomain) {
  if (!emailOrDomain) {
    return false;
  }

  const domain = emailOrDomain.includes('@')
    ? emailOrDomain.split('@')[1]
    : emailOrDomain;

  return DISPOSABLE_SET.has(domain.toLowerCase());
}

/**
 * Quick check: is this email from a blocked corporate/social-media domain?
 * Works with a full email address or just a domain.
 *
 * @param {string} emailOrDomain
 * @returns {boolean}
 */
function isCorporate(emailOrDomain) {
  if (!emailOrDomain) {
    return false;
  }

  const domain = emailOrDomain.includes('@')
    ? emailOrDomain.split('@')[1]
    : emailOrDomain;

  return CORPORATE_SET.has(domain.toLowerCase());
}

module.exports = { validate, isDisposable, isCorporate, DEFAULT_CHECKS, ALL_CHECKS };
