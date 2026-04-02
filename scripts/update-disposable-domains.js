#!/usr/bin/env node

/**
 * Fetches the latest disposable email domain list from GitHub and saves it as JSON.
 *
 * Source: https://github.com/disposable-email-domains/disposable-email-domains
 * (curated, ~5k domains, low false-positive rate)
 *
 * Run manually:   node scripts/update-disposable-domains.js
 * Runs automatically on: npm prepublishOnly
 */
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'manager', 'libraries', 'disposable-domains.json');

async function main() {
  console.log('Fetching disposable domain list...');

  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const domains = text
    .trim()
    .split('\n')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(domains)].sort();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unique, null, 2) + '\n');

  console.log(`Updated disposable-domains.json: ${unique.length} domains`);
}

main().catch((e) => {
  console.warn('Warning: Failed to update disposable domains:', e.message);
  console.warn('Using existing list. Run manually later: node scripts/update-disposable-domains.js');
});
