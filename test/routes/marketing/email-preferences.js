/**
 * Test: POST /marketing/email-preferences
 *
 * Two modes:
 * - Anonymous HMAC: from email-footer unsubscribe link. Requires email + asmId + sig.
 *   Hits SendGrid ASM and (NEW) mirrors to user doc if email maps to a user.
 * - Authenticated: from account-page toggle. Requires only `action`.
 *   Writes consent.marketing to user doc with source='account' and hits SendGrid + Beehiiv
 *   via the email library.
 *
 * Set TEST_EXTENDED_MODE=true to hit real SendGrid + Beehiiv. Otherwise provider calls
 * are skipped but user-doc mutations still happen.
 */
const crypto = require('crypto');

const TEST_EMAIL = 'rachel.greene+bem-unsub@gmail.com';
const TEST_ASM_ID = '24077';

function generateSig(email) {
  return crypto.createHmac('sha256', process.env.UNSUBSCRIBE_HMAC_KEY).update(email.toLowerCase()).digest('hex');
}

module.exports = {
  description: 'Marketing email-preferences (anonymous HMAC + authenticated)',
  type: 'group',
  tests: [
    // ─── Anonymous HMAC flow ───

    {
      name: 'anon-unsubscribe-valid-sig-succeeds',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig,
        });
        assert.isSuccess(response, 'Unsubscribe with valid sig should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
      },
    },

    {
      name: 'anon-subscribe-valid-sig-succeeds',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'subscribe',
          sig,
        });
        assert.isSuccess(response, 'Subscribe with valid sig should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
      },
    },

    {
      name: 'anon-resubscribe-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        // Old 'resubscribe' action is no longer accepted — must use 'subscribe'
        const sig = generateSig(TEST_EMAIL);
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'resubscribe',
          sig,
        });
        assert.isError(response, 400, 'Old "resubscribe" action should be rejected');
      },
    },

    {
      name: 'anon-invalid-sig-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: 'invalid-signature-value',
        });
        assert.isError(response, 403, 'Invalid sig should return 403');
      },
    },

    {
      name: 'anon-missing-email-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const response = await http.post('backend-manager/marketing/email-preferences', {
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: 'anything',
        });
        assert.isError(response, 400, 'Missing email should return 400');
      },
    },

    {
      name: 'anon-invalid-email-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const sig = generateSig('not-an-email');
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: 'not-an-email',
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig,
        });
        assert.isError(response, 400, 'Invalid email format should return 400');
      },
    },

    {
      name: 'anon-missing-asmid-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          action: 'unsubscribe',
          sig,
        });
        assert.isError(response, 400, 'Missing asmId should return 400');
      },
    },

    {
      name: 'anon-invalid-action-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'delete',
          sig,
        });
        assert.isError(response, 400, 'Invalid action should return 400');
      },
    },

    {
      name: 'anon-wrong-email-sig-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        // sig generated for a different email — must not validate against TEST_EMAIL
        const sig = generateSig('someone-else@gmail.com');
        const response = await http.post('backend-manager/marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig,
        });
        assert.isError(response, 403, 'Sig for different email should return 403');
      },
    },

    // ─── Authenticated mode ───

    {
      name: 'auth-unsubscribe-writes-consent-and-records-source-account',
      auth: 'basic',
      timeout: 15000,
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;

        const beforeMs = Date.now();
        const response = await http.as('basic').post('backend-manager/marketing/email-preferences', {
          action: 'unsubscribe',
        });
        const afterMs = Date.now();

        assert.isSuccess(response, `Authenticated unsubscribe should succeed: ${JSON.stringify(response, null, 2)}`);
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
        assert.propertyEquals(response, 'data.action', 'unsubscribe', 'action echoed in response');

        const userDoc = await firestore.get(`users/${uid}`);

        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'consent.marketing.status should be revoked');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'account', 'revokedAt.source should be account');
        assert.ok(userDoc?.consent?.marketing?.revokedAt?.timestamp, 'revokedAt.timestamp should be set');
        assert.equal(typeof userDoc?.consent?.marketing?.revokedAt?.timestampUNIX, 'number', 'revokedAt.timestampUNIX should be number');

        // Server time used (defense against clock manipulation).
        // Server uses Math.round, so the stamped value can be 1 second past Math.floor(afterMs/1000)
        // when the request takes >500ms. Use Math.round on the upper bound + a small fudge.
        const revokedUNIX = userDoc.consent.marketing.revokedAt.timestampUNIX;
        const beforeUNIX = Math.floor(beforeMs / 1000);
        const afterUNIX = Math.round(afterMs / 1000) + 1;
        assert.ok(
          revokedUNIX >= beforeUNIX && revokedUNIX <= afterUNIX,
          `revokedAt.timestampUNIX (${revokedUNIX}) should be server time, between ${beforeUNIX} and ${afterUNIX}`
        );
      },
    },

    {
      name: 'auth-subscribe-after-unsubscribe-flips-status-keeps-prior-revokedAt',
      auth: 'basic',
      timeout: 15000,
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;

        // Capture revokedAt from the previous test
        const beforeDoc = await firestore.get(`users/${uid}`);
        const priorRevokedAt = beforeDoc?.consent?.marketing?.revokedAt;
        assert.ok(priorRevokedAt?.timestamp, 'Prior test should have left a revokedAt timestamp');

        const response = await http.as('basic').post('backend-manager/marketing/email-preferences', {
          action: 'subscribe',
        });

        assert.isSuccess(response, `Authenticated subscribe should succeed: ${JSON.stringify(response, null, 2)}`);

        const userDoc = await firestore.get(`users/${uid}`);

        // status flips
        assert.equal(userDoc?.consent?.marketing?.status, 'granted', 'status should flip to granted');

        // grantedAt populated with new server time + source=account
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.source, 'account', 'grantedAt.source should be account');
        assert.ok(userDoc?.consent?.marketing?.grantedAt?.timestamp, 'grantedAt.timestamp should be set');

        // revokedAt UNTOUCHED — still reflects the most recent revoke
        assert.equal(
          userDoc?.consent?.marketing?.revokedAt?.timestamp,
          priorRevokedAt.timestamp,
          'revokedAt.timestamp should be preserved from prior revoke'
        );
        assert.equal(
          userDoc?.consent?.marketing?.revokedAt?.source,
          priorRevokedAt.source,
          'revokedAt.source should be preserved from prior revoke'
        );
      },
    },

    {
      name: 'auth-invalid-action-rejected',
      auth: 'basic',
      timeout: 15000,
      async run({ http, assert }) {
        const response = await http.as('basic').post('backend-manager/marketing/email-preferences', {
          action: 'delete',
        });
        assert.isError(response, 400, 'Invalid action should return 400');
      },
    },

    {
      name: 'auth-opt-in-old-name-rejected',
      auth: 'basic',
      timeout: 15000,
      async run({ http, assert }) {
        // Old proposed 'opt-in' is NOT accepted — must use 'subscribe'
        const response = await http.as('basic').post('backend-manager/marketing/email-preferences', {
          action: 'opt-in',
        });
        assert.isError(response, 400, 'Old "opt-in" name should be rejected (use "subscribe")');
      },
    },

    {
      name: 'unauthenticated-without-sig-rejected',
      auth: 'none',
      timeout: 15000,
      async run({ http, assert }) {
        // Unauthenticated + no sig → email field is required for HMAC path → 400.
        // (No auth means we hit the anonymous path; no email/asmId means missing-required.)
        const response = await http.post('backend-manager/marketing/email-preferences', {
          action: 'unsubscribe',
        });
        assert.isError(response, 400, 'Unauthenticated request without HMAC fields should 400');
      },
    },
  ],
};
