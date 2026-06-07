#!/usr/bin/env node

/**
 * Test Helper — direct provider lookups + removals via API
 *
 * Lets the live-test checklist verify SendGrid + Beehiiv state without
 * clicking around in dashboards. Reuses the same provider helpers that
 * BEM uses in production (findContact / removeContact).
 *
 * Usage (run from a consumer project's functions/ dir):
 *
 *   node ../../../backend-manager/scripts/test-helper-providers.js find  user@example.com
 *   node ../../../backend-manager/scripts/test-helper-providers.js purge user@example.com
 *
 * Or symlink: `ln -s ../../../backend-manager/scripts/test-helper-providers.js ./prov`
 * then: `node ./prov find user@example.com`
 *
 * - find:  prints whether the contact exists in SendGrid + Beehiiv (and the data shape).
 * - purge: removes the contact from BOTH providers (idempotent; safe if absent).
 *
 * The script picks up:
 *   - SENDGRID_API_KEY, BEEHIIV_API_KEY from <cwd>/.env (functions/.env)
 *   - marketing.campaigns.listId, marketing.newsletter.publicationId from <cwd>/backend-manager-config.json
 *   - service-account from <cwd>/service-account.json
 *
 * Exit codes: 0 ok, 1 usage error, 2 provider error.
 */

const path = require('path');
const fs = require('fs');

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const configPath = path.join(cwd, 'backend-manager-config.json');
const serviceAccountPath = path.join(cwd, 'service-account.json');

// --- sanity checks ---
if (!fs.existsSync(envPath)) {
  console.error(`✗ Missing ${envPath} — run from the consumer's functions/ dir`);
  process.exit(1);
}
if (!fs.existsSync(configPath)) {
  console.error(`✗ Missing ${configPath} — run from the consumer's functions/ dir`);
  process.exit(1);
}
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`✗ Missing ${serviceAccountPath} — run from the consumer's functions/ dir`);
  process.exit(1);
}

// --- parse args ---
const [, , cmd, email] = process.argv;
const VALID_CMDS = ['find', 'purge'];

if (!cmd || !VALID_CMDS.includes(cmd) || !email) {
  console.error('Usage:');
  console.error('  node test-helper-providers.js find  <email>');
  console.error('  node test-helper-providers.js purge <email>');
  process.exit(1);
}

// --- bootstrap env (dotenv style, minimal) ---
require('dotenv').config({ path: envPath });

if (!process.env.SENDGRID_API_KEY) {
  console.error('✗ SENDGRID_API_KEY not set in .env');
  process.exit(1);
}
if (!process.env.BEEHIIV_API_KEY) {
  console.error('✗ BEEHIIV_API_KEY not set in .env');
  process.exit(1);
}

// --- bootstrap Manager so providers can read Manager.config.marketing.* ---
// The providers require '../../../index.js' which is the Manager singleton.
// We need to load BEM from the consumer's node_modules (not the BEM repo's own src)
// so it picks up the consumer's config + service account.
let Manager;
try {
  const BackendManager = require(path.join(cwd, 'node_modules', 'backend-manager'));
  Manager = (new BackendManager()).init({}, { setupFunctionsLegacy: false, log: false });
} catch (e) {
  console.error('✗ Failed to bootstrap Manager from consumer node_modules:', e.message);
  process.exit(2);
}

// --- load providers via the BEM Manager.libraries surface (preferred) or direct path ---
const sendgridProviderPath = path.join(cwd, 'node_modules', 'backend-manager', 'src', 'manager', 'libraries', 'email', 'providers', 'sendgrid.js');
const beehiivProviderPath = path.join(cwd, 'node_modules', 'backend-manager', 'src', 'manager', 'libraries', 'email', 'providers', 'beehiiv.js');

const sendgrid = require(sendgridProviderPath);
const beehiiv = require(beehiivProviderPath);

// --- commands ---
async function find(email) {
  console.log(`Looking up ${email} on both providers...`);

  const [sgContact, bhContact] = await Promise.all([
    sendgrid.findContact(email).catch(e => ({ _error: e.message })),
    beehiiv.findContact(email).catch(e => ({ _error: e.message })),
  ]);

  console.log('\n── SendGrid ──');
  if (sgContact?._error) {
    console.log(`  ✗ error: ${sgContact._error}`);
  } else if (!sgContact) {
    console.log('  ⊘ not found');
  } else {
    console.log(`  ✓ found — id=${sgContact.id || '?'}, email=${sgContact.email || '?'}`);
  }

  console.log('\n── Beehiiv ──');
  if (bhContact?._error) {
    console.log(`  ✗ error: ${bhContact._error}`);
  } else if (!bhContact) {
    console.log('  ⊘ not found');
  } else {
    console.log(`  ✓ found — id=${bhContact.id || '?'}, email=${bhContact.email || '?'}, status=${bhContact.status || '?'}`);
  }

  return { sgContact, bhContact };
}

async function purge(email) {
  console.log(`Removing ${email} from both providers...`);

  const [sgResult, bhResult] = await Promise.all([
    sendgrid.removeContact(email).catch(e => ({ _error: e.message })),
    beehiiv.removeContact(email).catch(e => ({ _error: e.message })),
  ]);

  console.log('\n── SendGrid ──');
  if (sgResult?._error) {
    console.log(`  ✗ error: ${sgResult._error}`);
  } else {
    console.log(`  ✓ ${JSON.stringify(sgResult)}`);
  }

  console.log('\n── Beehiiv ──');
  if (bhResult?._error) {
    console.log(`  ✗ error: ${bhResult._error}`);
  } else {
    console.log(`  ✓ ${JSON.stringify(bhResult)}`);
  }

  return { sgResult, bhResult };
}

// --- main ---
(async () => {
  try {
    if (cmd === 'find') {
      await find(email);
    } else if (cmd === 'purge') {
      await purge(email);
    }
    process.exit(0);
  } catch (e) {
    console.error('✗ Unexpected error:', e);
    process.exit(2);
  }
})();
