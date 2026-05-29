/**
 * Test: mergeLineBasedFiles()
 * Unit tests for the line-based .env / .gitignore / CLAUDE.md merge.
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP.
 *
 * Regression coverage for the bug that scrambled consumers' `.env` files: an
 * older positional implementation zipped comment lines and value lines by index,
 * so any drift in key order shifted every value under the wrong header. The
 * canonical impl merges BY KEY, so headers always re-anchor to the template and
 * values follow their key across sections.
 */
const {
  mergeLineBasedFiles,
  DEFAULT_MARKER,
  CUSTOM_MARKER,
} = require('../../src/utils/merge-line-files.js');

// Setup-test helper shim — must re-export the SAME canonical impl (SSOT).
const helperShim = require('../../src/cli/commands/setup-tests/helpers/merge-line-files.js');

// A representative framework .env template (keys grouped under headers).
const TEMPLATE = [
  DEFAULT_MARKER,
  '# GitHub',
  'GH_TOKEN=""',
  '',
  '# AI',
  'OPENAI_API_KEY=""',
  'ANTHROPIC_API_KEY=""',
  '',
  '# Payment Processors',
  'PAYPAL_CLIENT_SECRET=""',
  'STRIPE_SECRET_KEY=""',
  '',
  CUSTOM_MARKER,
  '# Add your custom environment variables below this line',
].join('\n');

// Pull the value assigned to a key in a given section of a merged result.
function keyValueInSection(merged, key, section /* 'default' | 'custom' */) {
  const lines = merged.split('\n');
  let mode = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === DEFAULT_MARKER) { mode = 'default'; continue; }
    if (trimmed === CUSTOM_MARKER) { mode = 'custom'; continue; }
    if (mode !== section || !trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() === key) return trimmed.slice(eq + 1);
  }
  return undefined;
}

// Count how many times a key appears anywhere (catches duplication bugs).
function keyOccurrences(merged, key) {
  return merged.split('\n').filter((l) => l.trim().startsWith(`${key}=`)).length;
}

// Assert a key sits directly under the expected comment header in the merged output.
function headerAboveKey(merged, key) {
  const lines = merged.split('\n');
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.startsWith('#') && t !== DEFAULT_MARKER && t !== CUSTOM_MARKER) return t;
    if (t && !t.startsWith('#')) continue; // another key — keep scanning up
  }
  return null;
}

module.exports = {
  description: 'mergeLineBasedFiles() line-based .env / .gitignore merge',
  type: 'group',

  tests: [
    {
      name: 'ssot-helper-shim-is-same-function',
      async run({ assert }) {
        assert.equal(
          helperShim.mergeLineBasedFiles,
          mergeLineBasedFiles,
          'setup-tests helper must re-export the canonical mergeLineBasedFiles (SSOT)'
        );
        assert.equal(helperShim.DEFAULT_SECTION_MARKER, DEFAULT_MARKER, 'marker alias matches');
        assert.equal(helperShim.CUSTOM_SECTION_MARKER, CUSTOM_MARKER, 'marker alias matches');
        assert.ok(helperShim.hasSectionMarkers(TEMPLATE), 'hasSectionMarkers detects markers');
      },
    },

    {
      name: 'preserves-existing-values-by-key',
      async run({ assert }) {
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GH_TOKEN="ghp_real"',
          '# AI',
          'OPENAI_API_KEY="sk-real"',
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET="pp_real"',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, TEMPLATE, '.env');
        assert.equal(keyValueInSection(merged, 'GH_TOKEN', 'default'), '"ghp_real"', 'GH_TOKEN value kept');
        assert.equal(keyValueInSection(merged, 'OPENAI_API_KEY', 'default'), '"sk-real"', 'OPENAI value kept');
        assert.equal(keyValueInSection(merged, 'PAYPAL_CLIENT_SECRET', 'default'), '"pp_real"', 'PAYPAL value kept');
      },
    },

    {
      name: 'keys-stay-under-correct-header-when-order-drifts',
      async run({ assert }) {
        // Existing file has keys in a DIFFERENT order than the template. The old
        // positional merge would shift values under the wrong header here.
        const existing = [
          DEFAULT_MARKER,
          '# Misc (old grouping)',
          'STRIPE_SECRET_KEY="stripe_real"',
          'OPENAI_API_KEY="openai_real"',
          'GH_TOKEN="gh_real"',
          'PAYPAL_CLIENT_SECRET="pp_real"',
          'ANTHROPIC_API_KEY="anthropic_real"',
          CUSTOM_MARKER,
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, TEMPLATE, '.env');

        assert.equal(headerAboveKey(merged, 'OPENAI_API_KEY'), '# AI', 'OPENAI under # AI');
        assert.equal(headerAboveKey(merged, 'ANTHROPIC_API_KEY'), '# AI', 'ANTHROPIC under # AI');
        assert.equal(headerAboveKey(merged, 'PAYPAL_CLIENT_SECRET'), '# Payment Processors', 'PAYPAL under # Payment Processors');
        assert.equal(headerAboveKey(merged, 'STRIPE_SECRET_KEY'), '# Payment Processors', 'STRIPE under # Payment Processors');
        assert.equal(headerAboveKey(merged, 'GH_TOKEN'), '# GitHub', 'GH_TOKEN under # GitHub');

        // Values still attached to the right keys.
        assert.equal(keyValueInSection(merged, 'STRIPE_SECRET_KEY', 'default'), '"stripe_real"', 'STRIPE value intact');
        assert.equal(keyValueInSection(merged, 'OPENAI_API_KEY', 'default'), '"openai_real"', 'OPENAI value intact');
      },
    },

    {
      name: 'promotes-custom-key-to-default-when-template-adopts-it',
      async run({ assert }) {
        // User had APOLLO_API_KEY in Custom; framework adds it to the template.
        const tplWithApollo = TEMPLATE.replace('STRIPE_SECRET_KEY=""', 'STRIPE_SECRET_KEY=""\nAPOLLO_API_KEY=""');
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GH_TOKEN="gh_real"',
          '# AI',
          'OPENAI_API_KEY=""',
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET=""',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
          'APOLLO_API_KEY="apollo_real"',
          'GITHUB_TOKEN="legacy"',
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, tplWithApollo, '.env');

        assert.equal(keyValueInSection(merged, 'APOLLO_API_KEY', 'default'), '"apollo_real"', 'APOLLO promoted to Default with value');
        assert.equal(keyValueInSection(merged, 'APOLLO_API_KEY', 'custom'), undefined, 'APOLLO removed from Custom');
        assert.equal(keyOccurrences(merged, 'APOLLO_API_KEY'), 1, 'APOLLO not duplicated');
      },
    },

    {
      name: 'migrates-unknown-default-key-to-custom',
      async run({ assert }) {
        // User has a legacy key in Default that the template no longer defines.
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GITHUB_TOKEN="legacy_real"', // template now uses GH_TOKEN
          'GH_TOKEN="gh_real"',
          '# AI',
          'OPENAI_API_KEY=""',
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET=""',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, TEMPLATE, '.env');

        assert.equal(keyValueInSection(merged, 'GITHUB_TOKEN', 'custom'), '"legacy_real"', 'legacy key migrated to Custom with value');
        assert.equal(keyValueInSection(merged, 'GITHUB_TOKEN', 'default'), undefined, 'legacy key gone from Default');
        assert.equal(keyValueInSection(merged, 'GH_TOKEN', 'default'), '"gh_real"', 'GH_TOKEN kept in Default');
      },
    },

    {
      name: 'preserves-custom-section-verbatim',
      async run({ assert }) {
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GH_TOKEN=""',
          '# AI',
          'OPENAI_API_KEY=""',
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET=""',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
          'MY_CUSTOM_KEY="custom_real"',
          '# OAuth2',
          'OAUTH_ID="abc"',
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, TEMPLATE, '.env');
        assert.equal(keyValueInSection(merged, 'MY_CUSTOM_KEY', 'custom'), '"custom_real"', 'custom key preserved');
        assert.equal(keyValueInSection(merged, 'OAUTH_ID', 'custom'), '"abc"', 'custom OAuth key preserved');
        assert.ok(merged.includes('# OAuth2'), 'custom comment preserved');
      },
    },

    {
      name: 'normalizes-raw-values-to-double-quoted',
      async run({ assert }) {
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GH_TOKEN=raw-no-quotes',
          '# AI',
          "OPENAI_API_KEY='single'",
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET=""',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
        ].join('\n');

        const merged = mergeLineBasedFiles(existing, TEMPLATE, '.env');
        assert.equal(keyValueInSection(merged, 'GH_TOKEN', 'default'), '"raw-no-quotes"', 'raw value double-quoted');
        assert.equal(keyValueInSection(merged, 'OPENAI_API_KEY', 'default'), '"single"', 'single-quoted canonicalized to double');
      },
    },

    {
      name: 'is-idempotent',
      async run({ assert }) {
        const existing = [
          DEFAULT_MARKER,
          '# GitHub',
          'GH_TOKEN="gh_real"',
          '# AI',
          'OPENAI_API_KEY="sk"',
          'ANTHROPIC_API_KEY=""',
          '# Payment Processors',
          'PAYPAL_CLIENT_SECRET=""',
          'STRIPE_SECRET_KEY=""',
          CUSTOM_MARKER,
          'CUSTOM="x"',
        ].join('\n');

        const once = mergeLineBasedFiles(existing, TEMPLATE, '.env');
        const twice = mergeLineBasedFiles(once, TEMPLATE, '.env');
        assert.equal(once, twice, 're-running the merge produces identical output');
      },
    },
  ],
};
