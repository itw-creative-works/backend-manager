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
        const signupResponse = await http.as('referred-invalid').post('user/signup', {
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
        const signupResponse = await http.as('referred').post('user/signup', {
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
        const signupResponse = await http.as('referred').post('user/signup', {
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

    // --- Auth rejection test (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      async run({ http, assert }) {
        // Try to call POST /user/signup without authentication
        const signupResponse = await http.as('none').post('user/signup', {
          attribution: {
            affiliate: { code: REFERRER_AFFILIATE_CODE },
          },
        });

        assert.isError(signupResponse, 401, 'Signup should fail without authentication');
      },
    },
  ],
};
