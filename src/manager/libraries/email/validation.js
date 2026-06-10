/**
 * Email validation — single entry point for all email quality checks
 *
 * Available checks (run in this order):
 * - format     — basic email regex
 * - disposable — checks against known disposable domain list (~7k domains)
 * - corporate  — blocks corporate/social-media domains (meta.com, instagram.com, soundcloud.com, etc.)
 * - localPart  — blocks spam/junk local parts (test, noreply, all-numeric, etc.)
 * - typo       — catches common domain misspellings (gamil., gmai., aol.con, etc.)
 * - dns        — verifies domain has MX records (no MX = can't receive email, guaranteed fail)
 * - mailbox    — verifies mailbox exists via API (costs money, requires NEVERBOUNCE_API_KEY or ZEROBOUNCE_API_KEY)
 *
 * Usage:
 *   validate(email)                                          // All free checks (format + disposable + corporate + localPart + typo)
 *   validate(email, { checks: ['format', 'disposable'] })    // Only format + disposable
 *   validate(email, { checks: ALL_CHECKS })                  // Everything including dns + mailbox
 *
 * Used by:
 * - routes/marketing/contact/post.js
 * - functions/core/actions/api/general/add-marketing-contact.js
 * - routes/user/signup/post.js (disposable check only)
 * - libraries/email/marketing/index.js (safety net before Beehiiv/SendGrid add/sync)
 */
const path = require('path');
const dns = require('dns');
const { promisify } = require('util');
const neverbounceProvider = require('./validation-provider-neverbounce');
const zerobounceProvider = require('./validation-provider-zerobounce');

const resolveMx = promisify(dns.resolveMx);

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

// Load typo-domain prefixes — common misspellings of major providers
const TYPO_DOMAIN_PREFIXES = require(path.join(DATA_DIR, 'typo-domains.js'));

// Format regex
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default checks (all free checks — mailbox excluded because it costs money)
const DEFAULT_CHECKS = ['format', 'disposable', 'corporate', 'localPart', 'typo'];

// All available checks (dns is free but async/slow — opt-in for bulk validation)
const ALL_CHECKS = ['format', 'disposable', 'corporate', 'localPart', 'typo', 'dns', 'mailbox'];

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

  // 5. Typo domain — common misspellings of major providers
  if (checks.has('typo') && domain) {
    const matchedPrefix = TYPO_DOMAIN_PREFIXES.find((prefix) => domain.startsWith(prefix));

    if (matchedPrefix) {
      result.valid = false;
      result.checks.typo = { valid: false, domain, matchedPrefix, reason: 'Likely misspelled domain' };
      return result;
    }

    result.checks.typo = { valid: true };
  }

  // 6. DNS — guaranteed-fail checks (no MX, null MX, loopback MX, domain not found)
  if (checks.has('dns') && domain) {
    try {
      const records = await resolveMx(domain);

      if (!records || records.length === 0) {
        result.valid = false;
        result.checks.dns = { valid: false, domain, reason: 'No MX records' };
        return result;
      }

      // Null MX (RFC 7505): exchange is empty or "." — domain explicitly rejects email
      const hasNullMx = records.some((r) => !r.exchange || r.exchange === '.');
      if (hasNullMx) {
        result.valid = false;
        result.checks.dns = { valid: false, domain, reason: 'Null MX (domain rejects email)' };
        return result;
      }

      // Loopback MX: points to localhost or 0.0.0.0 — can't receive external mail
      const hasLoopbackMx = records.some((r) =>
        r.exchange === 'localhost'
        || r.exchange === '0.0.0.0'
        || r.exchange.startsWith('127.')
        || r.exchange.endsWith('.invalid'),
      );
      if (hasLoopbackMx) {
        result.valid = false;
        result.checks.dns = { valid: false, domain, reason: 'Loopback MX (localhost/invalid)' };
        return result;
      }

      result.checks.dns = { valid: true, mxCount: records.length };
    } catch (e) {
      if (e.code === 'ENOTFOUND' || e.code === 'ENODATA' || e.code === 'ESERVFAIL') {
        result.valid = false;
        result.checks.dns = { valid: false, domain, reason: `DNS lookup failed: ${e.code}` };
        return result;
      }
      // Network error or timeout — don't block the email
      result.checks.dns = { valid: true, skipped: true, reason: `DNS error: ${e.code}` };
    }
  }

  // 7. Mailbox verification (NeverBounce preferred, ZeroBounce fallback)
  if (checks.has('mailbox')) {
    const provider = process.env.NEVERBOUNCE_API_KEY
      ? neverbounceProvider
      : (process.env.ZEROBOUNCE_API_KEY ? zerobounceProvider : null);

    if (!provider) {
      result.checks.mailbox = { valid: true, skipped: true, reason: 'No API key', provider: null };
      return result;
    }

    const mailboxResult = await provider.verify(email);
    result.checks.mailbox = mailboxResult;

    if (!mailboxResult.valid) {
      result.valid = false;
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
