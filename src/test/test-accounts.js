const uuid = require('uuid');

/**
 * Resolve the first paid subscription product from config
 * Falls back to 'premium' if no config or no paid products found
 */
function getFirstPaidProduct(config) {
  const products = config?.payment?.products || [];
  const paid = products.find(p => p.type === 'subscription' && p.id !== 'basic');
  return paid
    ? { id: paid.id, name: paid.name }
    : { id: 'premium', name: 'Premium' };
}

/**
 * Helper to create a future expiration date for premium subscriptions
 * User() checks subscription.expires to determine if subscription is active
 * If expires is in the past (or default 1970), subscription gets downgraded to basic
 */
function getFutureExpires(years = 10) {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + years);
  return {
    timestamp: futureDate.toISOString(),
    timestampUNIX: Math.floor(futureDate.getTime() / 1000),
  };
}

/**
 * Helper to create a past expiration date for expired subscriptions
 */
function getPastExpires(years = 1) {
  const pastDate = new Date();
  pastDate.setFullYear(pastDate.getFullYear() - years);
  return {
    timestamp: pastDate.toISOString(),
    timestampUNIX: Math.floor(pastDate.getTime() / 1000),
  };
}

/**
 * Static test accounts - always created with fixed properties
 * Used for testing access control levels
 * Both BEM and consuming projects rely on these
 *
 * Structure: { id, uid, email, properties }
 * - id: Account identifier
 * - uid: Firebase Auth UID
 * - email: Email with {domain} placeholder (resolved at runtime)
 * - properties: Object to merge into user doc after auth:on-create
 *
 * IMPORTANT: Premium accounts MUST have subscription.expires set to a future date
 * and subscription.status set to 'active'
 */
const STATIC_ACCOUNTS = {
  admin: {
    id: 'admin',
    uid: '_test-admin',
    email: '_test.admin@{domain}',
    properties: {
      roles: { admin: true },
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Admin', last: 'User' } },
    },
  },
  basic: {
    id: 'basic',
    uid: '_test-basic',
    email: '_test.basic@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Alex', last: 'Basic' } },
    },
  },
  'premium-active': {
    id: 'premium-active',
    uid: '_test-premium-active',
    email: '_test.premium-active@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'active', expires: getFutureExpires() },
    },
  },
  'premium-expired': {
    id: 'premium-expired',
    uid: '_test-premium-expired',
    email: '_test.premium-expired@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'cancelled', expires: getPastExpires() },
    },
  },
  'premium-suspended': {
    id: 'premium-suspended',
    uid: '_test-premium-suspended',
    email: '_test.premium-suspended@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'suspended', expires: getFutureExpires() },
    },
  },
  'premium-cancelling': {
    id: 'premium-cancelling',
    uid: '_test-premium-cancelling',
    email: '_test.premium-cancelling@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: true } },
    },
  },
  delete: {
    id: 'delete',
    uid: '_test-delete',
    email: '_test.delete@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'active', expires: getFutureExpires() }, // Active subscription - deletion should be blocked initially
    },
  },
  'delete-by-admin': {
    id: 'delete-by-admin',
    uid: '_test-delete-by-admin',
    email: '_test.delete-by-admin@{domain}',
    properties: {
      roles: {},
      // No subscription - can be deleted immediately by admin
    },
  },
  referrer: {
    id: 'referrer',
    uid: '_test-referrer',
    email: '_test.referrer@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      affiliate: { code: 'TESTREF', referrals: [] },
    },
  },
  referred: {
    id: 'referred',
    uid: '_test-referred',
    email: '_test.referred@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'referred-invalid': {
    id: 'referred-invalid',
    uid: '_test-referred-invalid',
    email: '_test.referred-invalid@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'referred-disposable': {
    id: 'referred-disposable',
    uid: '_test-referred-disposable',
    email: '_test.referred-disposable@mailinator.com',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // The two `consent-*` accounts use the `_test.allow_*` prefix so they bypass
  // the `_test.*` marketing-block in blocked-local-patterns.js. They're the
  // live-provider integration sentinels — they intentionally round-trip through
  // SendGrid + Beehiiv to verify the consent gate works end-to-end.
  'consent-granted': {
    id: 'consent-granted',
    uid: '_test-allow-consent-granted',
    email: '_test.allow_consent-granted@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'consent-declined': {
    id: 'consent-declined',
    uid: '_test-allow-consent-declined',
    email: '_test.allow_consent-declined@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'consent-missing': {
    id: 'consent-missing',
    uid: '_test-consent-missing',
    email: '_test.consent-missing@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Used to verify the never-downgrade guard: the test seeds this account's doc with already-
  // granted consent, then re-fires /user/signup with an empty consent payload and asserts the
  // grant is preserved (not flipped to revoked). Dedicated account so the seeded state is isolated.
  'consent-preserve': {
    id: 'consent-preserve',
    uid: '_test-consent-preserve',
    email: '_test.consent-preserve@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Used to verify buildUserRecord's layered deep-merge: the test seeds this account's doc with
  // real values (api keys, paid subscription, admin role, a custom non-schema field) + a partial
  // attribution, fires /user/signup, and asserts the merge PRESERVES those real/custom values
  // while still filling every schema leaf and applying the signup data on top.
  'signup-merge': {
    id: 'signup-merge',
    uid: '_test-signup-merge',
    email: '_test.signup-merge@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
};

/**
 * Journey test accounts - for testing subscription/payment flows
 * These accounts transition through states via webhook tests
 */
const JOURNEY_ACCOUNTS = {
  'journey-payments-upgrade': {
    id: 'journey-payments-upgrade',
    uid: '_test-journey-payments-upgrade',
    email: '_test.journey-payments-upgrade@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Jordan', last: 'Upgrade' } },
    },
  },
  'journey-payments-cancel': {
    id: 'journey-payments-cancel',
    uid: '_test-journey-payments-cancel',
    email: '_test.journey-payments-cancel@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Casey', last: 'Cancel' } },
    },
  },
  'journey-payments-suspend': {
    id: 'journey-payments-suspend',
    uid: '_test-journey-payments-suspend',
    email: '_test.journey-payments-suspend@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Sam', last: 'Suspend' } },
    },
  },
  'journey-payments-trial': {
    id: 'journey-payments-trial',
    uid: '_test-journey-payments-trial',
    email: '_test.journey-payments-trial@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Taylor', last: 'Trial' } },
    },
  },
  'journey-payments-trial-cancel': {
    id: 'journey-payments-trial-cancel',
    uid: '_test-journey-payments-trial-cancel',
    email: '_test.journey-payments-trial-cancel@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Morgan', last: 'Trial' } },
    },
  },
  'journey-payments-failure': {
    id: 'journey-payments-failure',
    uid: '_test-journey-payments-failure',
    email: '_test.journey-payments-failure@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Riley', last: 'Failure' } },
    },
  },
  'journey-payments-plan-change': {
    id: 'journey-payments-plan-change',
    uid: '_test-journey-payments-plan-change',
    email: '_test.journey-payments-plan-change@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Avery', last: 'Planchg' } },
    },
  },
  'journey-payments-one-time': {
    id: 'journey-payments-one-time',
    uid: '_test-journey-payments-one-time',
    email: '_test.journey-payments-one-time@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-intent': {
    id: 'journey-payments-intent',
    uid: '_test-journey-payments-intent',
    email: '_test.journey-payments-intent@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-cancel-route': {
    id: 'journey-payments-cancel-route',
    uid: '_test-journey-payments-cancel-route',
    email: '_test.journey-payments-cancel-route@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'route-cancel-success': {
    id: 'route-cancel-success',
    uid: '_test-route-cancel-success',
    email: '_test.route-cancel-success@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-portal-route': {
    id: 'journey-payments-portal-route',
    uid: '_test-journey-payments-portal-route',
    email: '_test.journey-payments-portal-route@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-intent-discount': {
    id: 'journey-payments-intent-discount',
    uid: '_test-journey-payments-intent-discount',
    email: '_test.journey-payments-intent-discount@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Drew', last: 'Discount' } },
    },
  },
  'intent-discount-validation': {
    id: 'intent-discount-validation',
    uid: '_test-intent-discount-validation',
    email: '_test.intent-discount-validation@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-intent-attribution': {
    id: 'journey-payments-intent-attribution',
    uid: '_test-journey-payments-intent-attribution',
    email: '_test.journey-payments-intent-attribution@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  'journey-payments-intent-trial': {
    id: 'journey-payments-intent-trial',
    uid: '_test-journey-payments-intent-trial',
    email: '_test.journey-payments-intent-trial@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Dedicated accounts for cancel validation tests — each needs a distinct, non-conflicting subscription state
  'cancel-no-processor': {
    id: 'cancel-no-processor',
    uid: '_test-cancel-no-processor',
    email: '_test.cancel-no-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: false }, payment: { processor: null, resourceId: null } },
    },
  },
  'cancel-already-pending': {
    id: 'cancel-already-pending',
    uid: '_test-cancel-already-pending',
    email: '_test.cancel-already-pending@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: true }, payment: { processor: 'stripe', resourceId: 'sub_test_fake' } },
    },
  },
  'cancel-unknown-processor': {
    id: 'cancel-unknown-processor',
    uid: '_test-cancel-unknown-processor',
    email: '_test.cancel-unknown-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: false }, payment: { processor: 'unknown-processor', resourceId: 'sub_test_fake' } },
    },
  },
  'cancel-too-young': {
    id: 'cancel-too-young',
    uid: '_test-cancel-too-young',
    email: '_test.cancel-too-young@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: false }, payment: { processor: 'test', resourceId: 'sub_test_fake', startDate: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) } } },
    },
  },
  // Dedicated accounts for portal validation tests
  'portal-no-processor': {
    id: 'portal-no-processor',
    uid: '_test-portal-no-processor',
    email: '_test.portal-no-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), payment: { processor: null, resourceId: null } },
    },
  },
  'portal-unknown-processor': {
    id: 'portal-unknown-processor',
    uid: '_test-portal-unknown-processor',
    email: '_test.portal-unknown-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), payment: { processor: 'unknown-processor', resourceId: 'sub_test_fake' } },
    },
  },
  // Dedicated accounts for refund validation tests
  'refund-active-no-cancel': {
    id: 'refund-active-no-cancel',
    uid: '_test-refund-active-no-cancel',
    email: '_test.refund-active-no-cancel@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'active', expires: getFutureExpires(), cancellation: { pending: false }, payment: { processor: 'test', resourceId: 'sub_test_fake' } },
    },
  },
  'refund-no-processor': {
    id: 'refund-no-processor',
    uid: '_test-refund-no-processor',
    email: '_test.refund-no-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'cancelled', expires: getPastExpires(), cancellation: { pending: false }, payment: { processor: null, resourceId: null } },
    },
  },
  'refund-unknown-processor': {
    id: 'refund-unknown-processor',
    uid: '_test-refund-unknown-processor',
    email: '_test.refund-unknown-processor@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'cancelled', expires: getPastExpires(), cancellation: { pending: false }, payment: { processor: 'unknown-processor', resourceId: 'sub_test_fake' } },
    },
  },
  'refund-expired-payment': {
    id: 'refund-expired-payment',
    uid: '_test-refund-expired-payment',
    email: '_test.refund-expired-payment@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium', name: 'Premium' }, status: 'cancelled', expires: getPastExpires(), cancellation: { pending: false }, payment: { processor: 'test', resourceId: 'sub_test_fake', startDate: getPastExpires() } },
    },
  },
  'route-refund-success': {
    id: 'route-refund-success',
    uid: '_test-route-refund-success',
    email: '_test.route-refund-success@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Journey: refund webhook transition (charge.refunded fires payment-refunded transition)
  'journey-payments-refund-webhook': {
    id: 'journey-payments-refund-webhook',
    uid: '_test-journey-payments-refund-webhook',
    email: '_test.journey-payments-refund-webhook@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Journey: UID resolution fallback (webhook without uid in metadata, resolved from fetched resource)
  'journey-payments-uid-resolution': {
    id: 'journey-payments-uid-resolution',
    uid: '_test-journey-payments-uid-resolution',
    email: '_test.journey-payments-uid-resolution@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Journey: legacy product ID resolution (webhook with legacy product ID maps to correct product)
  'journey-payments-legacy-product': {
    id: 'journey-payments-legacy-product',
    uid: '_test-journey-payments-legacy-product',
    email: '_test.journey-payments-legacy-product@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
    },
  },
  // Dedicated accounts for user resolve tests — must not be reused by other tests
  'resolve-premium-active': {
    id: 'resolve-premium-active',
    uid: '_test-resolve-premium-active',
    email: '_test.resolve-premium-active@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'active', expires: getFutureExpires() },
    },
  },
  'resolve-premium-expired': {
    id: 'resolve-premium-expired',
    uid: '_test-resolve-premium-expired',
    email: '_test.resolve-premium-expired@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'premium' }, status: 'cancelled', expires: getPastExpires() },
    },
  },
  // Journey: marketing webhook revocation (test/routes/marketing/webhook.js). The
  // SendGrid/Beehiiv revoke-event tests repeatedly write consent.marketing.status='revoked'
  // to the target account — persistent side-effect data, so it must never be the shared
  // `basic` account (revoked consent would persist for the rest of the run and trip the
  // email library's consent gate for every later sync of that account).
  'journey-webhook-revoke': {
    id: 'journey-webhook-revoke',
    uid: '_test-journey-webhook-revoke',
    email: '_test.journey-webhook-revoke@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Webb', last: 'Revoke' } },
    },
  },
  // Journey: live-provider sync round-trip (test/email/marketing-lifecycle.js, extended
  // mode only). The `_test.allow_*` email prefix bypasses the `_test.*` marketing block so
  // sync() reaches real SendGrid/Beehiiv; the suite's cleanup DELETE then removes the
  // contact AND mirrors revoked consent to this account's doc. Dedicated account so that
  // side effect stays isolated — the shared `consent-granted` sentinel is used by the
  // signup and consent-lifecycle suites and must keep its granted state.
  'journey-marketing-sync': {
    id: 'journey-marketing-sync',
    uid: '_test-journey-marketing-sync',
    email: '_test.allow_journey-marketing-sync@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
      personal: { name: { first: 'Lifecycle', last: 'Sync' } },
    },
  },
};

/**
 * All test accounts combined
 */
const TEST_ACCOUNTS = {
  ...STATIC_ACCOUNTS,
  ...JOURNEY_ACCOUNTS,
};

/**
 * Get all test account definitions with resolved emails and dynamic product IDs
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @param {object} [config] - BEM config (used to resolve first paid product)
 * @param {object} [extraAccounts] - Project-defined accounts from test/_init.js,
 *   keyed by id, each `{ id, uid, email, properties }`. Merged after the built-in
 *   accounts; a project account may override a built-in one by reusing its key.
 * @returns {object} Account definitions with resolved emails
 */
function getAccountDefinitions(domain, config, extraAccounts) {
  const paidProduct = getFirstPaidProduct(config);
  const accounts = {};

  const all = { ...TEST_ACCOUNTS, ...(extraAccounts || {}) };

  for (const [key, account] of Object.entries(all)) {
    const properties = JSON.parse(JSON.stringify(account.properties || {}));

    // Replace hardcoded 'premium' product with the actual first paid product from config
    if (properties.subscription?.product?.id === 'premium') {
      properties.subscription.product.id = paidProduct.id;
      properties.subscription.product.name = paidProduct.name;
    }

    accounts[key] = {
      id: account.id,
      uid: account.uid,
      email: (account.email || '').replace('{domain}', domain),
      properties,
    };
  }

  return accounts;
}

/**
 * Fetch privateKeys for test accounts from Firestore
 * @param {object} admin - Firebase admin instance
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @param {object} [config] - BEM config (used to resolve first paid product)
 * @param {object} [extraAccounts] - Project-defined accounts from test/_init.js
 * @returns {Promise<object>} Account credentials with privateKeys
 */
async function fetchPrivateKeys(admin, domain, config, extraAccounts) {
  const definitions = getAccountDefinitions(domain, config, extraAccounts);
  const accounts = {};

  // Fetch all in parallel
  const entries = Object.entries(definitions);
  const results = await Promise.all(
    entries.map(async ([key, account]) => {
      try {
        const doc = await admin.firestore().doc(`users/${account.uid}`).get();

        if (doc.exists) {
          const data = doc.data();
          return {
            key,
            data: {
              uid: account.uid,
              email: account.email,
              privateKey: data.api?.privateKey || null,
              exists: true,
            },
          };
        }

        return {
          key,
          data: {
            uid: account.uid,
            email: account.email,
            privateKey: null,
            exists: false,
          },
        };
      } catch (error) {
        console.error(`Error fetching account ${key}:`, error.message);
        return {
          key,
          data: {
            uid: account.uid,
            email: account.email,
            privateKey: null,
            exists: false,
            error: error.message,
          },
        };
      }
    })
  );

  // Convert array back to object
  for (const { key, data } of results) {
    accounts[key] = data;
  }

  return accounts;
}

/**
 * Create a single test account
 * Assumes deleteTestUsers() was called first to ensure clean state
 * Creates Firebase Auth user, waits for auth:on-create, then merges test properties
 * @param {object} admin - Firebase admin instance
 * @param {object} account - Account definition with uid, email, properties
 * @returns {Promise<object>} Result { uid, email }
 */
async function createAccount(admin, account) {
  const userRef = admin.firestore().doc(`users/${account.uid}`);

  // The Auth user for this UID was just deleted (deleteTestUsers). Its auth:on-delete
  // trigger deletes the Firestore doc ASYNCHRONOUSLY and the emulator does NOT guarantee
  // it fires (or finishes) before our subsequent createUser()'s auth:on-create. A stale
  // on-delete can therefore land AFTER on-create and silently wipe the freshly-written
  // doc — leaving the account with no api.clientId/privateKey. That intermittent clobber
  // is what made the account-structure validation (and every downstream auth/payment test)
  // flaky. We defend with a verify-and-repair retry: create → wait for the on-create write
  // to be COMPLETE (api keys present, not just metadata.tag) → merge props → re-verify the
  // keys survived. If a late on-delete clobbered the doc, recreate from scratch.
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Create Firebase Auth user - triggers auth:on-create
    await admin.auth().createUser({
      uid: account.uid,
      email: account.email,
      password: uuid.v4(),
      emailVerified: true,
    }).catch(async (e) => {
      // A retry may find the Auth user already present (its doc was clobbered, not the
      // user). Delete it first so the fresh createUser re-fires a clean on-create.
      if (e.code === 'auth/uid-already-exists') {
        await admin.auth().deleteUser(account.uid).catch(() => {});
        await waitForDocGone(userRef);
        await admin.auth().createUser({
          uid: account.uid,
          email: account.email,
          password: uuid.v4(),
          emailVerified: true,
        });
      } else {
        throw e;
      }
    });

    // Wait for auth:on-create to COMPLETE. Poll on the api keys themselves — the fields the
    // tests actually require — not just metadata.tag, which on its own doesn't prove the
    // doc wasn't subsequently clobbered.
    const ready = await waitForAccountReady(userRef);

    // Merge test-specific properties (roles, subscription, etc.)
    await userRef.set(account.properties, { merge: true });

    // Re-verify after the merge: a late on-delete could have struck between the poll and
    // here. If the api keys survived, the account is good. Otherwise loop and recreate.
    const finalDoc = await userRef.get();
    const data = finalDoc.data() || {};
    if (ready && data.api?.clientId && data.api?.privateKey) {
      return { uid: account.uid, email: account.email };
    }

    // Clobbered (or never completed). Tear down the Auth user so the next attempt starts
    // from a clean slate, then retry.
    if (attempt < maxAttempts) {
      await admin.auth().deleteUser(account.uid).catch(() => {});
      await waitForDocGone(userRef);
    }
  }

  // Exhausted retries — return anyway so the runner reports the downstream failure with a
  // meaningful test assertion rather than a setup throw.
  return { uid: account.uid, email: account.email };
}

/**
 * Poll until a user doc reflects a COMPLETE auth:on-create write (api keys present).
 * Returns true if it became ready within the window, false on timeout.
 */
async function waitForAccountReady(userRef) {
  const maxWait = 15000;
  const pollInterval = 500;
  let waited = 0;

  while (waited < maxWait) {
    const doc = await userRef.get();
    const data = doc.exists ? doc.data() : null;
    if (
      data?.metadata?.tag === 'auth:on-create'
      && data.api?.clientId
      && data.api?.privateKey
    ) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
  }

  return false;
}

/**
 * Poll until a user doc no longer exists (on-delete settled). Bounded; best-effort.
 */
async function waitForDocGone(userRef) {
  const maxWait = 10000;
  const pollInterval = 200;
  let waited = 0;

  while (waited < maxWait) {
    const doc = await userRef.get();
    if (!doc.exists) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
  }

  // Fallback: force-delete the lingering doc so the next create starts clean.
  await userRef.delete().catch(() => {});
}

/**
 * Flush the ENTIRE emulator Firestore — every top-level collection, recursively.
 *
 * SAFETY: this is destructive, so it ONLY runs when connected to the Firestore
 * emulator (`FIRESTORE_EMULATOR_HOST` is set — which the test command always
 * sets). If that env var is absent, this is a no-op, so it can never wipe a real
 * project's data. The emulator DB is entirely test data, so a full flush is the
 * simplest correct "clean slate" — no per-collection allowlist to maintain.
 *
 * @param {object} admin - Firebase admin instance
 */
async function flushEmulatorFirestore(admin) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    // Not pointed at the emulator — refuse to mass-delete. No-op.
    return;
  }

  const firestore = admin.firestore();
  const collections = await firestore.listCollections().catch(() => []);

  await Promise.all(
    collections.map((collectionRef) => firestore.recursiveDelete(collectionRef).catch(() => {}))
  );
}

/**
 * Delete all test users (both Auth and Firestore)
 * Uses TEST_ACCOUNTS (+ any project-defined accounts) as the source of truth for
 * which UIDs to delete. Deleting Auth users triggers on-delete which handles
 * Firestore doc + count decrement.
 * Called before test runs to ensure a clean slate. Flushes the ENTIRE emulator
 * Firestore (the emulator DB is 100% test data — there's nothing to preserve),
 * then deletes the Auth test users. `test/_init.js`'s `setup()` reseeds fixtures
 * afterward. Waits for Firestore docs to be deleted before returning.
 * @param {object} admin - Firebase admin instance
 * @param {object} [extraAccounts] - Project-defined accounts from test/_init.js
 * @returns {Promise<object>} Result with deleted count
 */
async function deleteTestUsers(admin, extraAccounts) {
  const results = { deleted: [], skipped: [], failed: [] };

  // Wipe the entire emulator Firestore up front (guarded to emulator-only).
  await flushEmulatorFirestore(admin);

  // Clear auth users via the emulator's bulk-clear REST API instead of
  // individual deleteUser() calls. Individual deletes trigger auth:on-delete
  // for EACH user, and those triggers fire asynchronously — a late on-delete
  // can land AFTER the subsequent createTestAccounts() on-create and clobber
  // the freshly-written doc (80% repro rate in stress tests). The bulk API
  // clears the auth store without triggering event handlers at all.
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT || 'demo-test';

  if (authHost) {
    try {
      const url = `http://${authHost}/emulator/v1/projects/${projectId}/accounts`;
      await fetch(url, { method: 'DELETE' });

      // Count all known accounts as deleted (the bulk API doesn't return per-user results)
      const allAccounts = { ...TEST_ACCOUNTS, ...(extraAccounts || {}) };
      results.deleted = Object.values(allAccounts).map(a => a.uid);
    } catch (e) {
      // Bulk clear failed — fall back to individual deletes
      const allAccounts = { ...TEST_ACCOUNTS, ...(extraAccounts || {}) };
      await _deleteAccountsIndividually(admin, allAccounts, results);
    }
  } else {
    // Not running against emulator — fall back to individual deletes
    const allAccounts = { ...TEST_ACCOUNTS, ...(extraAccounts || {}) };
    await _deleteAccountsIndividually(admin, allAccounts, results);
  }

  // Realtime Database: wipe the `_test` namespace in full. (The Firestore-wide
  // flush already ran in flushEmulatorFirestore() at the start of this function.)
  // `admin.database()` throws synchronously when no Database URL is configured,
  // so guard the whole thing — RTDB is optional for a project.
  try {
    await admin.database().ref('_test').remove();
  } catch (e) {
    // RTDB not configured / no database URL — ignore.
  }

  return {
    success: results.failed.length === 0,
    deleted: results.deleted.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    errors: results.failed,
  };
}

async function _deleteAccountsIndividually(admin, allAccounts, results) {
  await Promise.all(
    Object.values(allAccounts).map(async (account) => {
      try {
        await admin.auth().deleteUser(account.uid);

        const maxWait = 10000;
        const interval = 200;
        let waited = 0;

        while (waited < maxWait) {
          const doc = await admin.firestore().doc(`users/${account.uid}`).get();
          if (!doc.exists) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, interval));
          waited += interval;
        }

        if (waited >= maxWait) {
          await admin.firestore().doc(`users/${account.uid}`).delete().catch(() => {});
        }

        results.deleted.push(account.uid);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          await admin.firestore().doc(`users/${account.uid}`).delete().catch(() => {});
          results.skipped.push(account.uid);
        } else {
          results.failed.push({ uid: account.uid, error: error.message });
        }
      }
    })
  );
}

/**
 * Create all test accounts
 * Assumes deleteTestUsers() was called first to ensure clean state
 * @param {object} admin - Firebase admin instance
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @param {object} [config] - BEM config (used to resolve first paid product)
 * @param {object} [extraAccounts] - Project-defined accounts from test/_init.js
 * @returns {Promise<object>} Result with created/failed counts
 */
async function createTestAccounts(admin, domain, config, extraAccounts) {
  const definitions = getAccountDefinitions(domain, config, extraAccounts);
  const results = { created: [], failed: [] };

  // Create all accounts in parallel
  await Promise.all(
    Object.entries(definitions).map(async ([key, account]) => {
      try {
        await createAccount(admin, account);
        results.created.push({ id: key, uid: account.uid, email: account.email });
      } catch (error) {
        results.failed.push({ id: key, uid: account.uid, email: account.email, error: error.message });
      }
    })
  );

  return {
    success: results.failed.length === 0,
    created: results.created.length,
    failed: results.failed.length,
    accounts: results.created,
    errors: results.failed,
  };
}

/**
 * Test data constants - SSOT for test values
 */
const TEST_DATA = {
  affiliateCode: 'TESTREF',
  filterUid: 'test-user-uid-12345',
  defaultProjectId: 'demo-test',
};

module.exports = {
  STATIC_ACCOUNTS,
  JOURNEY_ACCOUNTS,
  TEST_ACCOUNTS,
  TEST_DATA,
  getFirstPaidProduct,
  getAccountDefinitions,
  fetchPrivateKeys,
  deleteTestUsers,
  createTestAccounts,
};
