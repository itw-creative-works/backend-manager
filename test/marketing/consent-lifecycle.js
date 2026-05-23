/**
 * Test: Marketing Provider Lifecycle (end-to-end against live SendGrid + Beehiiv)
 *
 * Walks two long-lived test accounts through their full lifecycle and verifies
 * provider state at every transition:
 *
 *   1. Pre-check    — both accounts should be absent from SendGrid + Beehiiv
 *   2. Sync         — flip consent.marketing.status and call Marketing.sync()
 *   3. Verify       — granted account present in both, declined account absent from both
 *   4. Unsubscribe  — hit the email-preferences endpoint for the granted account
 *   5. Verify       — granted account now absent from both
 *
 * The two accounts use the `_test.allow_*` prefix so they bypass the
 * blocked-local-patterns gate (which blocks plain `_test.*` from reaching
 * providers). They are the only accounts intentionally allowed to round-trip
 * through SendGrid + Beehiiv.
 *
 * Run with TEST_EXTENDED_MODE=true (no-op otherwise). Requires SENDGRID_API_KEY
 * and BEEHIIV_API_KEY in env. Total runtime is ~60-90s — most of it spent waiting
 * for SendGrid's async upsert/delete background jobs to surface.
 */
const sendgridProvider = require('../../src/manager/libraries/email/providers/sendgrid.js');
const beehiivProvider = require('../../src/manager/libraries/email/providers/beehiiv.js');

const SETTLE_MS = 5000; // Beehiiv settles in 1-2s; SendGrid's background-job upsert can take 10-20s+
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 90000; // SendGrid's delete-contact job can take 30-60s+ to surface

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a provider lookup until it matches the expected state (present/absent).
 * Returns the resolved value (contact object or null) once condition is met, or
 * the last value seen after timing out.
 *
 * @param {Function} fetchFn - async function that returns contact or null
 * @param {boolean} expectPresent - true = wait until present, false = wait until absent
 */
async function pollProvider(fetchFn, expectPresent) {
  const start = Date.now();
  let lastValue = null;

  while (Date.now() - start < POLL_MAX_MS) {
    lastValue = await fetchFn();
    const present = !!lastValue;
    if (present === expectPresent) {
      return lastValue;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return lastValue;
}

module.exports = {
  description: 'Marketing provider lifecycle (live SendGrid + Beehiiv round-trip)',
  type: 'group',
  skip: !process.env.TEST_EXTENDED_MODE
    ? 'TEST_EXTENDED_MODE not set (this test hits live SendGrid + Beehiiv APIs)'
    : false,
  tests: [
    // ─────────────────────────────────────────────────────────────────────
    // Phase 1 — Pre-check: both accounts should be absent from providers
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phase-1-pre-check-both-accounts-absent',
      auth: 'admin',
      timeout: 180000,

      async run({ accounts, assert }) {
        const granted = accounts['consent-granted'];
        const declined = accounts['consent-declined'];

        // Force-clean any leftovers from a prior run (e.g. the previous phase-2a
        // left a contact in SendGrid that THIS run's phase-1 needs to start
        // without). SendGrid's delete is an async job, so wait for absence.
        await sendgridProvider.removeContact(granted.email);
        await sendgridProvider.removeContact(declined.email);
        await beehiivProvider.removeContact(granted.email);
        await beehiivProvider.removeContact(declined.email);

        const grantedSg = await pollProvider(() => sendgridProvider.findContact(granted.email), false);
        const declinedSg = await pollProvider(() => sendgridProvider.findContact(declined.email), false);
        const grantedBh = await pollProvider(() => beehiivProvider.findContact(granted.email), false);
        const declinedBh = await pollProvider(() => beehiivProvider.findContact(declined.email), false);

        assert.equal(grantedSg, null, 'granted account should be absent from SendGrid');
        assert.equal(declinedSg, null, 'declined account should be absent from SendGrid');
        assert.equal(grantedBh, null, 'granted account should be absent from Beehiiv');
        assert.equal(declinedBh, null, 'declined account should be absent from Beehiiv');
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase 2 — Sync granted account → both providers
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phase-2a-granted-account-syncs-to-both-providers',
      auth: 'admin',
      timeout: 180000,

      async run({ accounts, assert, Manager, assistant }) {
        const granted = accounts['consent-granted'];
        const admin = Manager.libraries.admin;

        // Set consent.marketing.status = 'granted' on the user doc
        await admin.firestore().doc(`users/${granted.uid}`).set({
          consent: {
            marketing: {
              status: 'granted',
              grantedAt: {
                timestamp: new Date().toISOString(),
                timestampUNIX: Math.floor(Date.now() / 1000),
                source: 'test',
                ip: null,
                text: 'consent-lifecycle test',
              },
            },
            legal: {
              status: 'granted',
              grantedAt: {
                timestamp: new Date().toISOString(),
                timestampUNIX: Math.floor(Date.now() / 1000),
                source: 'test',
                ip: null,
                text: 'consent-lifecycle test',
              },
            },
          },
        }, { merge: true });

        // Trigger marketing sync via the Email() surface
        const result = await Manager.Email(assistant).sync(granted.uid);
        assert.ok(result, 'sync should return a result');
        assert.notEqual(result.blocked, 'validation', 'sync should not be blocked by validation (uses _test.allow_*)');

        // Poll providers until they reflect the upsert. SendGrid's upsert is
        // an async background job (returns a job_id, not the inserted contact)
        // so a single check 5s later isn't enough — it can take 10-20s to
        // surface. Beehiiv is usually instant but uses the same poll for symmetry.
        const sgContact = await pollProvider(() => sendgridProvider.findContact(granted.email), true);
        const bhContact = await pollProvider(() => beehiivProvider.findContact(granted.email), true);

        assert.ok(sgContact, 'granted account should now exist in SendGrid');
        assert.ok(bhContact, 'granted account should now exist in Beehiiv');
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase 2b — Declined account: verify it stays out of providers when we
    // DON'T call sync (which is what the signup route does for declined
    // marketing consent).
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phase-2b-declined-account-stays-out-of-providers',
      auth: 'admin',
      timeout: 180000,

      async run({ accounts, assert, Manager, assistant }) {
        const declined = accounts['consent-declined'];
        const admin = Manager.libraries.admin;

        // Set consent.marketing.status = 'revoked' on the user doc.
        // We deliberately do NOT call sync — the production signup route gates
        // on consent.marketing.status === 'granted' before calling sync, so a
        // declined user simply never gets a sync call. We verify that contract
        // by NOT calling sync and asserting the user stays absent.
        await admin.firestore().doc(`users/${declined.uid}`).set({
          consent: {
            marketing: {
              status: 'revoked',
              grantedAt: { timestamp: null, timestampUNIX: null, source: null, ip: null, text: null },
              revokedAt: {
                timestamp: new Date().toISOString(),
                timestampUNIX: Math.floor(Date.now() / 1000),
                source: 'test',
                ip: null,
                text: null,
              },
            },
            legal: {
              status: 'granted',
              grantedAt: {
                timestamp: new Date().toISOString(),
                timestampUNIX: Math.floor(Date.now() / 1000),
                source: 'test',
                ip: null,
                text: 'consent-lifecycle test',
              },
            },
          },
        }, { merge: true });

        await sleep(SETTLE_MS);

        const sgContact = await sendgridProvider.findContact(declined.email);
        const bhContact = await beehiivProvider.findContact(declined.email);

        assert.equal(sgContact, null, 'declined account should remain absent from SendGrid');
        assert.equal(bhContact, null, 'declined account should remain absent from Beehiiv');
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase 3 — Unsubscribe: granted account is removed via Manager.Email().remove
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phase-3-granted-account-unsubscribe-removes-from-both',
      auth: 'admin',
      timeout: 180000,

      async run({ accounts, assert, Manager, assistant }) {
        const granted = accounts['consent-granted'];

        // Trigger removal — simulates the email-preferences opt-out flow
        const result = await Manager.Email(assistant).remove(granted.email);
        assert.ok(result, 'remove should return a result');

        // Poll for absence — SendGrid's contact delete is also an async job.
        const sgContact = await pollProvider(() => sendgridProvider.findContact(granted.email), false);
        const bhContact = await pollProvider(() => beehiivProvider.findContact(granted.email), false);

        assert.equal(sgContact, null, 'granted account should now be absent from SendGrid');
        assert.equal(bhContact, null, 'granted account should now be absent from Beehiiv');
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase 4 — Validation gate: _test.* (non-allow) is blocked by validate()
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phase-4-non-allow-test-email-blocked-by-validation',
      auth: 'admin',
      timeout: 30000,

      async run({ assert, Manager, assistant }) {
        // _test.never-reaches-providers@... is NOT _test.allow_* → should be blocked
        const blockedEmail = '_test.never-reaches-providers@somiibo.com';

        const result = await Manager.Email(assistant).add({ email: blockedEmail });

        assert.equal(result.blocked, 'validation', 'non-allow _test.* email should be blocked by validation');

        // And the provider lookup should show nothing
        const sgContact = await sendgridProvider.findContact(blockedEmail);
        const bhContact = await beehiivProvider.findContact(blockedEmail);

        assert.equal(sgContact, null, 'blocked email should never appear in SendGrid');
        assert.equal(bhContact, null, 'blocked email should never appear in Beehiiv');
      },
    },
  ],
};
