const { TEST_ACCOUNTS } = require('../../../src/test/test-accounts.js');

// SSOT: Affiliate code from referrer account definition
const REFERRER_AFFILIATE_CODE = TEST_ACCOUNTS.referrer.properties.affiliate.code;

/**
 * Test Suite: POST /user/signup
 * Tests the complete user signup flow including:
 * - Using pre-created referrer with an affiliate code
 * - Calling user signup with that referral code
 * - Verifying the referral tracking works
 * - Edge cases: unauthenticated, signing up for another user, invalid affiliate code
 *
 * Note: referrer and referred accounts are pre-created by the test runner
 * The referrer has affiliate.code set at creation time (see test-accounts.js)
 */
module.exports = {
  description: 'User signup flow with affiliate tracking',
  type: 'suite',
  timeout: 60000, // Longer timeout for auth events to process

  tests: [
    // --- Edge case tests ---
    {
      name: 'signup-with-invalid-affiliate-code',
      async run({ http, assert }) {
        // Try to sign up with a non-existent affiliate code
        // Use dedicated account so it doesn't affect other tests
        const signupResponse = await http.as('referred-invalid').post('backend-manager/user/signup', {
          attribution: {
            affiliate: { code: 'INVALID_CODE_12345' },
          },
        });

        // Should succeed but without referral tracking (invalid code is ignored)
        assert.isSuccess(signupResponse, 'Signup should succeed even with invalid affiliate code');
      },
    },

    // --- Main signup flow tests ---
    {
      name: 'verify-referrer-exists',
      async run({ firestore, assert, state, accounts }) {
        // Use the pre-created static referrer account
        state.referrerUid = accounts.referrer.uid;
        state.referrerEmail = accounts.referrer.email;
        state.referrerAffiliateCode = REFERRER_AFFILIATE_CODE;

        // Verify the referrer account exists and has the affiliate code
        const referrerDoc = await firestore.get(`users/${state.referrerUid}`);

        assert.ok(referrerDoc, 'Referrer user doc should exist');
        assert.equal(
          referrerDoc?.affiliate?.code,
          state.referrerAffiliateCode,
          'Referrer should have affiliate code set'
        );
      },
    },

    {
      name: 'verify-referred-exists',
      async run({ firestore, assert, state, accounts }) {
        // Use the pre-created static referred account
        state.referredUid = accounts.referred.uid;
        state.referredEmail = accounts.referred.email;

        // Verify the referred account exists
        const referredDoc = await firestore.get(`users/${state.referredUid}`);

        assert.ok(referredDoc, 'Referred user doc should exist');
      },
    },

    {
      name: 'call-user-signup-with-affiliate',
      async run({ http, assert, state }) {
        // Call POST /user/signup as the referred user with the new attribution format
        // This triggers the referral tracking logic
        // Use .as('referred') to authenticate as that specific user via privateKey
        const signupResponse = await http.as('referred').post('backend-manager/user/signup', {
          attribution: {
            affiliate: {
              code: state.referrerAffiliateCode,
              timestamp: new Date().toISOString(),
              url: `https://example.com/?ref=${REFERRER_AFFILIATE_CODE}`,
              page: '/',
            },
            utm: {
              tags: {
                utm_source: 'test',
                utm_medium: 'referral',
                utm_campaign: 'signup-test',
              },
              timestamp: new Date().toISOString(),
              url: 'https://example.com/?utm_source=test',
              page: '/',
            },
          },
          context: {
            referrer: 'https://google.com',
            landingPage: 'https://example.com/',
          },
        });

        assert.isSuccess(signupResponse, `POST /user/signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        // BEM API returns { data: { signedUp: true } }, http-client wraps in { data: response }
        const signedUp = signupResponse.data?.data?.signedUp || signupResponse.data?.signedUp;
        assert.ok(signedUp === true, `Should return signedUp: true (got: ${JSON.stringify(signupResponse.data)})`);
      },
    },

    {
      name: 'duplicate-signup-blocked',
      async run({ http, assert, state }) {
        // Try to call POST /user/signup again for the same user
        // This should be blocked since signup has already been processed
        const signupResponse = await http.as('referred').post('backend-manager/user/signup', {
          attribution: {
            affiliate: { code: state.referrerAffiliateCode },
          },
        });

        assert.isError(signupResponse, 400, 'Duplicate signup should be blocked');
        assert.ok(
          signupResponse.error?.includes('already been processed'),
          `Error should mention already processed: ${signupResponse.error}`
        );
      },
    },

    {
      name: 'wait-for-referral-update',
      async run({ firestore, assert, state, waitFor }) {
        // Wait for the referral to be recorded
        // The user signup endpoint calls updateReferral() which updates the referrer

        const referralFound = await waitFor(async () => {
          const referrerDoc = await firestore.get(`users/${state.referrerUid}`);

          if (!referrerDoc) {
            return false;
          }

          const referrals = referrerDoc?.affiliate?.referrals || [];
          return referrals.some(r => r.uid === state.referredUid);
        }, 30000, 1000); // Wait up to 30s, check every 1s

        assert.ok(referralFound, 'Referrer should have referred user in referrals array');
      },
    },

    {
      name: 'verify-referrer-has-referral',
      async run({ firestore, assert, state }) {
        // Verify the referrer now has the referred user in their referrals
        const referrerDoc = await firestore.get(`users/${state.referrerUid}`);

        assert.ok(referrerDoc, 'Should read referrer doc');

        const referrals = referrerDoc?.affiliate?.referrals || [];

        assert.ok(referrals.length > 0, 'Referrer should have at least one referral');

        const foundReferral = referrals.find(r => r.uid === state.referredUid);

        assert.ok(foundReferral, `Referrer should have ${state.referredUid} in referrals`);
        assert.ok(foundReferral.timestamp, 'Referral should have timestamp');
      },
    },

    {
      name: 'verify-attribution-data-saved',
      async run({ firestore, assert, state }) {
        // Verify the attribution data was saved correctly
        const referredDoc = await firestore.get(`users/${state.referredUid}`);

        assert.ok(referredDoc, 'Should read referred user doc');

        // Check attribution object (single source of truth for referrer info)
        const attribution = referredDoc?.attribution;
        assert.ok(attribution, 'Attribution object should exist');
        assert.ok(attribution?.affiliate?.code === state.referrerAffiliateCode, 'Attribution should have affiliate code');
        assert.ok(attribution?.utm?.tags?.utm_source === 'test', 'Attribution should have UTM source');
        assert.ok(attribution?.utm?.tags?.utm_campaign === 'signup-test', 'Attribution should have UTM campaign');

        // Check activity context was merged
        const activity = referredDoc?.activity;
        assert.ok(activity, 'Activity object should exist');
        assert.ok(activity?.referrer === 'https://google.com', 'Activity should have referrer from context');
        assert.ok(activity?.landingPage === 'https://example.com/', 'Activity should have landingPage from context');

        // Check flags
        assert.ok(referredDoc?.flags?.signupProcessed === true, 'signupProcessed flag should be true');
      },
    },

    // --- Disposable email referral test ---
    {
      name: 'disposable-email-referral-skipped',
      async run({ http, firestore, assert, state, accounts }) {
        // Record current referral count before disposable signup
        const referrerBefore = await firestore.get(`users/${state.referrerUid}`);
        const referralsBefore = referrerBefore?.affiliate?.referrals || [];
        state.referralCountBefore = referralsBefore.length;

        // Sign up a disposable email account with the referrer's affiliate code
        // The signup itself should succeed (account was created via Admin SDK, bypassing beforeCreate)
        // But the referral credit should be SKIPPED because the email is disposable
        const signupResponse = await http.as('referred-disposable').post('backend-manager/user/signup', {
          attribution: {
            affiliate: { code: state.referrerAffiliateCode },
          },
        });

        assert.isSuccess(signupResponse, 'Disposable email signup should succeed');

        // Verify NO new referral was added to the referrer
        // Small delay to ensure any async writes would have completed
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const referrerAfter = await firestore.get(`users/${state.referrerUid}`);
        const referralsAfter = referrerAfter?.affiliate?.referrals || [];

        assert.equal(
          referralsAfter.length,
          state.referralCountBefore,
          `Referrer should NOT get credit for disposable email referral (before=${state.referralCountBefore}, after=${referralsAfter.length})`
        );

        const disposableReferral = referralsAfter.find(r => r.uid === accounts['referred-disposable'].uid);
        assert.ok(!disposableReferral, 'Disposable account should NOT appear in referrals');
      },
    },

    // --- Consent capture tests ---
    {
      name: 'consent-granted-both-records-canonical-shape',
      async run({ http, firestore, assert, accounts }) {
        const consentText = {
          legal: 'I agree to the Terms of Service and Privacy Policy.',
          marketing: 'Send me product updates and newsletters. You can unsubscribe anytime.',
        };

        // Use absurdly-old client timestamp to prove server time wins (defense vs clock skew)
        const signupResponse = await http.as('consent-granted').post('backend-manager/user/signup', {
          consent: {
            legal: { granted: true, text: consentText.legal, timestamp: '2000-01-01T00:00:00.000Z' },
            marketing: { granted: true, text: consentText.marketing, timestamp: '2000-01-01T00:00:00.000Z' },
          },
        });

        assert.isSuccess(signupResponse, `Signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        const userDoc = await firestore.get(`users/${accounts['consent-granted'].uid}`);

        // Legal
        assert.equal(userDoc?.consent?.legal?.status, 'granted', 'consent.legal.status should be granted');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.source, 'signup', 'legal grantedAt.source should be signup-form');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.text, consentText.legal, 'legal grantedAt.text should match client payload');
        assert.ok(userDoc?.consent?.legal?.grantedAt?.timestamp, 'legal grantedAt.timestamp should be set');
        assert.equal(typeof userDoc?.consent?.legal?.grantedAt?.timestampUNIX, 'number', 'legal grantedAt.timestampUNIX should be number');

        // Server-derived time MUST be used (the client-supplied 2000-01-01 should NOT appear).
        // grantedAt is stamped from Auth's creationTime, the same source as metadata.created,
        // so the two must be equal — and the client's 2000-01-01 (UNIX 946684800) is rejected.
        const legalUNIX = userDoc.consent.legal.grantedAt.timestampUNIX;
        const createdUNIX = userDoc.metadata.created.timestampUNIX;
        assert.equal(
          legalUNIX, createdUNIX,
          `legal grantedAt.timestampUNIX (${legalUNIX}) should match metadata.created (${createdUNIX}) — both from Auth creationTime`
        );
        assert.notEqual(legalUNIX, 946684800, 'legal grantedAt must NOT be the client-supplied 2000-01-01 time');

        // Marketing
        assert.equal(userDoc?.consent?.marketing?.status, 'granted', 'consent.marketing.status should be granted');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.source, 'signup', 'marketing grantedAt.source should be signup-form');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.text, consentText.marketing, 'marketing grantedAt.text should match client payload');
        assert.equal(typeof userDoc?.consent?.marketing?.grantedAt?.timestampUNIX, 'number', 'marketing grantedAt.timestampUNIX should be number');

        // revokedAt should be all-null sibling object (NOT undefined, NOT missing)
        assert.ok(userDoc?.consent?.marketing?.revokedAt, 'marketing.revokedAt object should exist (not null)');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.timestamp, null, 'marketing revokedAt.timestamp should be null');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, null, 'marketing revokedAt.source should be null');
      },
    },

    {
      name: 'consent-marketing-declined-records-revokedAt',
      async run({ http, firestore, assert, accounts }) {
        const legalText = 'I agree to the Terms of Service and Privacy Policy.';

        const signupResponse = await http.as('consent-declined').post('backend-manager/user/signup', {
          consent: {
            legal: { granted: true, text: legalText },
            marketing: { granted: false, text: 'Send me updates.' },
          },
        });

        assert.isSuccess(signupResponse, `Signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        const userDoc = await firestore.get(`users/${accounts['consent-declined'].uid}`);

        // Legal — granted normally
        assert.equal(userDoc?.consent?.legal?.status, 'granted', 'legal.status should be granted');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.source, 'signup', 'legal grantedAt.source should be signup-form');

        // Marketing — revoked at signup
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'marketing.status should be revoked');

        // grantedAt MUST be all-null (never granted, even though client passed text)
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.timestamp, null, 'marketing grantedAt.timestamp should be null');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.source, null, 'marketing grantedAt.source should be null');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.text, null, 'marketing grantedAt.text should be null (declined)');

        // revokedAt MUST have signup-form-declined source + server time
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'signup', 'marketing revokedAt.source should be signup-form-declined');
        assert.ok(userDoc?.consent?.marketing?.revokedAt?.timestamp, 'marketing revokedAt.timestamp should be set');
        assert.equal(typeof userDoc?.consent?.marketing?.revokedAt?.timestampUNIX, 'number', 'marketing revokedAt.timestampUNIX should be number');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.text, null, 'marketing revokedAt.text should be null (decline has no message)');
      },
    },

    {
      name: 'consent-missing-defaults-to-revoked',
      async run({ http, firestore, assert, accounts }) {
        // Client sends NO consent field at all (legacy or malformed payload).
        // Expected: both legal + marketing default to revoked. No crash, no marketing sync.
        const signupResponse = await http.as('consent-missing').post('backend-manager/user/signup', {});

        assert.isSuccess(signupResponse, `Signup should succeed even with no consent: ${JSON.stringify(signupResponse, null, 2)}`);

        const userDoc = await firestore.get(`users/${accounts['consent-missing'].uid}`);

        assert.ok(userDoc?.consent, 'consent object should exist');
        assert.equal(userDoc?.consent?.legal?.status, 'revoked', 'legal.status should default to revoked');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.timestamp, null, 'legal grantedAt.timestamp should be null');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.source, null, 'legal grantedAt.source should be null');

        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'marketing.status should default to revoked');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.timestamp, null, 'marketing grantedAt.timestamp should be null');

        // Even when consent is missing entirely, the revokedAt block gets stamped with signup-form-declined.
        // This ensures the user doc has a recorded decline event for audit.
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'signup', 'marketing revokedAt.source should be signup-form-declined when consent missing');
      },
    },

    // --- Consent downgrade-protection tests ---
    // Guards against data loss when a LEGACY account (signed up before the flags.signupProcessed
    // flow existed, so flag never set) re-fires /user/signup on page load. Its localStorage
    // consent is long gone, so the payload is empty — without the guard, buildConsentRecord
    // would compute 'revoked' and the {merge:true} write would wipe the consent the user
    // actually granted months ago. The guard preserves any existing 'granted' status.
    {
      name: 'consent-empty-payload-preserves-existing-grant',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts['consent-preserve'].uid;

        // Seed the doc as an established account whose consent is already granted (as a real
        // legacy signup would be after the OMEGA migration backfilled consent). flags is left
        // at the schema default (signupProcessed: false) to mimic the legacy state exactly.
        // merge:true — preserve the runner-provisioned auth.uid (pollForUserDoc needs it).
        await firestore.set(`users/${uid}`, {
          consent: {
            legal: {
              status: 'granted',
              grantedAt: { timestamp: '2025-01-01T00:00:00.000Z', timestampUNIX: 1735689600, source: 'signup', ip: null, text: 'Legacy legal grant' },
            },
            marketing: {
              status: 'granted',
              grantedAt: { timestamp: '2025-01-01T00:00:00.000Z', timestampUNIX: 1735689600, source: 'signup', ip: null, text: 'Legacy marketing grant' },
              revokedAt: { timestamp: null, timestampUNIX: null, source: null, ip: null, text: null },
            },
          },
          flags: { signupProcessed: false },
        }, { merge: true });

        // Re-fire signup with NO consent payload (the legacy page-load case).
        const signupResponse = await http.as('consent-preserve').post('backend-manager/user/signup', {});
        assert.isSuccess(signupResponse, `Signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        const userDoc = await firestore.get(`users/${uid}`);

        // CRITICAL: the prior grants must survive — NOT be downgraded to revoked.
        assert.equal(userDoc?.consent?.legal?.status, 'granted', 'legal.status must stay granted (not downgraded by empty payload)');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.text, 'Legacy legal grant', 'legal grantedAt must be the preserved original, not wiped');
        assert.equal(userDoc?.consent?.legal?.grantedAt?.timestampUNIX, 1735689600, 'legal grantedAt timestamp must be preserved');

        assert.equal(userDoc?.consent?.marketing?.status, 'granted', 'marketing.status must stay granted (not downgraded by empty payload)');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.text, 'Legacy marketing grant', 'marketing grantedAt must be the preserved original');
        // No spurious revokedAt should have been stamped over the preserved grant.
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.timestamp, null, 'marketing revokedAt must stay null (no decline was recorded)');

        // signupProcessed should now be flipped true by this run.
        assert.equal(userDoc?.flags?.signupProcessed, true, 'signupProcessed should be set true after the run');
      },
    },
    {
      name: 'consent-explicit-decline-does-not-downgrade-existing-grant',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts['consent-preserve'].uid;

        // Re-seed: granted marketing + UNSET signupProcessed so the route processes this call.
        // Then send a payload that explicitly DECLINES marketing. The guard must still preserve
        // the existing grant — only an explicit RE-GRANT may overwrite; a decline-over-grant on
        // the signup path is treated as a non-grant and must not wipe a prior consent.
        // merge:true — preserve the runner-provisioned auth.uid (pollForUserDoc needs it).
        await firestore.set(`users/${uid}`, {
          consent: {
            marketing: {
              status: 'granted',
              grantedAt: { timestamp: '2025-01-01T00:00:00.000Z', timestampUNIX: 1735689600, source: 'signup', ip: null, text: 'Prior marketing grant' },
              revokedAt: { timestamp: null, timestampUNIX: null, source: null, ip: null, text: null },
            },
          },
          flags: { signupProcessed: false },
        }, { merge: true });

        const signupResponse = await http.as('consent-preserve').post('backend-manager/user/signup', {
          consent: {
            legal: { granted: true, text: 'Legal grant on re-fire' },
            marketing: { granted: false, text: 'Declining marketing' },
          },
        });
        assert.isSuccess(signupResponse, `Signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        const userDoc = await firestore.get(`users/${uid}`);

        // Legal newly granted this call.
        assert.equal(userDoc?.consent?.legal?.status, 'granted', 'legal.status should be granted from this call');
        // Marketing was already granted; an explicit decline must NOT downgrade it.
        assert.equal(userDoc?.consent?.marketing?.status, 'granted', 'marketing.status must stay granted (decline cannot downgrade an existing grant on signup path)');
        assert.equal(userDoc?.consent?.marketing?.grantedAt?.text, 'Prior marketing grant', 'marketing grant must be the preserved original');
      },
    },

    // --- buildUserRecord layered deep-merge tests ---
    // The signup write must: (a) fill every schema leaf so the doc is complete (no migration
    // churn), (b) PRESERVE existing real values (api keys, subscription, roles, affiliate.code,
    // custom non-schema fields), and (c) apply the signup data on top — without Firestore's
    // map-replace wiping nested data. These tests seed adversarial existing state and verify.
    {
      name: 'merge-preserves-existing-and-fills-schema',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts['signup-merge'].uid;

        // Capture the REAL api keys onCreate generated — the signup write must preserve these
        // exactly (regenerating them would break the user's API access AND this test's auth,
        // since http.as() authenticates with api.privateKey). We assert against the real values,
        // NOT a seeded fake (seeding a fake privateKey would 401 the request).
        const before = await firestore.get(`users/${uid}`);
        const realClientId = before?.api?.clientId;
        const realPrivateKey = before?.api?.privateKey;
        const realAffiliateCode = before?.affiliate?.code;

        // Seed adversarial NON-auth state the signup write must NOT clobber: a paid subscription,
        // admin role, a custom non-schema field, and a deliberately PARTIAL attribution (only
        // affiliate.code) to prove leaves get filled, not replaced-away. We do NOT touch api.* —
        // that's the auth credential and is asserted-preserved via the captured real values.
        await firestore.set(`users/${uid}`, {
          subscription: { product: { id: 'pro', name: 'Pro' }, status: 'active' },
          roles: { admin: true, betaTester: false, developer: false },
          attribution: { affiliate: { code: 'PARTIALONLY' } },
          myCustomIntegration: { slackWebhook: 'https://hooks.slack.com/services/XXX' },
        }, { merge: true });

        const signupResponse = await http.as('signup-merge').post('backend-manager/user/signup', {
          consent: { legal: { granted: true, text: 'I agree.' }, marketing: { granted: true, text: 'Updates please.' } },
          attribution: { utm: { tags: { utm_source: 'newsletter' } } },
        });
        assert.isSuccess(signupResponse, `Signup should succeed: ${JSON.stringify(signupResponse, null, 2)}`);

        const doc = await firestore.get(`users/${uid}`);

        // (b) Existing real values must survive untouched — NOT regenerated/reset by the schema layer.
        assert.equal(doc?.api?.clientId, realClientId, 'api.clientId must be preserved (not regenerated)');
        assert.equal(doc?.api?.privateKey, realPrivateKey, 'api.privateKey must be preserved (not regenerated)');
        assert.equal(doc?.affiliate?.code, realAffiliateCode, 'affiliate.code must be preserved (not regenerated)');
        assert.equal(doc?.subscription?.product?.id, 'pro', 'subscription must be preserved (not reset to basic)');
        assert.equal(doc?.roles?.admin, true, 'roles.admin must be preserved (not reset to false)');

        // (b) Custom non-schema field must survive the merge.
        assert.equal(doc?.myCustomIntegration?.slackWebhook, 'https://hooks.slack.com/services/XXX', 'custom non-schema field must survive');

        // (a) Every attribution leaf must be present (the bug: partial write flattened the map).
        assert.hasProperty(doc, 'attribution.affiliate.code', 'attribution.affiliate.code must exist');
        assert.hasProperty(doc, 'attribution.affiliate.url', 'attribution.affiliate.url must exist (filled)');
        assert.hasProperty(doc, 'attribution.affiliate.page', 'attribution.affiliate.page must exist (filled)');
        assert.hasProperty(doc, 'attribution.affiliate.timestamp', 'attribution.affiliate.timestamp must exist (filled)');
        assert.hasProperty(doc, 'attribution.utm.url', 'attribution.utm.url must exist (filled)');
        assert.hasProperty(doc, 'attribution.utm.page', 'attribution.utm.page must exist (filled)');
        assert.hasProperty(doc, 'attribution.utm.timestamp', 'attribution.utm.timestamp must exist (filled)');
        // filled leaves should be null, not undefined/missing
        assert.equal(doc?.attribution?.affiliate?.url, null, 'unset attribution leaf should be null');

        // (c) Signup data applied on top.
        assert.equal(doc?.attribution?.affiliate?.code, 'PARTIALONLY', 'pre-existing affiliate.code preserved (signup did not send one)');
        assert.equal(doc?.attribution?.utm?.tags?.utm_source, 'newsletter', 'signup utm tag applied');
        assert.equal(doc?.flags?.signupProcessed, true, 'flags.signupProcessed set true');
        assert.equal(doc?.consent?.legal?.status, 'granted', 'consent applied');
      },
    },
    {
      name: 'merge-fills-all-leaves-on-schema-complete-doc',
      async run({ http, firestore, assert, accounts }) {
        // Sanity: after signup, the doc must contain the full set of top-level schema sections,
        // so a subsequent migration finds NOTHING to backfill. Reuses the signup-merge account
        // (already processed above → re-fire is rejected, but the doc from the prior test is the
        // artifact we assert against; this test just validates that doc's completeness).
        const uid = accounts['signup-merge'].uid;
        const doc = await firestore.get(`users/${uid}`);

        for (const section of ['auth', 'roles', 'flags', 'affiliate', 'metadata', 'activity', 'api', 'personal', 'attribution', 'consent', 'subscription']) {
          assert.hasProperty(doc, section, `doc must have top-level '${section}' section after signup`);
        }
        // Nested completeness spot-checks across the sections signup writes.
        assert.hasProperty(doc, 'activity.geolocation.ip', 'activity.geolocation.ip must exist');
        assert.hasProperty(doc, 'activity.client.userAgent', 'activity.client.userAgent must exist');
        assert.hasProperty(doc, 'personal.name.first', 'personal.name.first must exist');
        assert.hasProperty(doc, 'consent.marketing.revokedAt.source', 'consent.marketing.revokedAt.source must exist');
        assert.hasProperty(doc, 'metadata.created.timestampUNIX', 'metadata.created.timestampUNIX must exist');
      },
    },

    // --- Auth rejection test (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      async run({ http, assert }) {
        // Try to call POST /user/signup without authentication
        const signupResponse = await http.as('none').post('backend-manager/user/signup', {
          attribution: {
            affiliate: { code: REFERRER_AFFILIATE_CODE },
          },
        });

        assert.isError(signupResponse, 401, 'Signup should fail without authentication');
      },
    },
  ],
};
