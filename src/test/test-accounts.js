const uuid = require('uuid');

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
    },
  },
  basic: {
    id: 'basic',
    uid: '_test-basic',
    email: '_test.basic@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' },
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
      subscription: { product: { id: 'basic' }, status: 'active' }, // Starts as basic, upgraded via Stripe webhook
    },
  },
  'journey-payments-cancel': {
    id: 'journey-payments-cancel',
    uid: '_test-journey-payments-cancel',
    email: '_test.journey-payments-cancel@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' }, // Test's first step overwrites with correct paid product from config
    },
  },
  'journey-payments-suspend': {
    id: 'journey-payments-suspend',
    uid: '_test-journey-payments-suspend',
    email: '_test.journey-payments-suspend@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' }, // Test's first step overwrites with correct paid product from config
    },
  },
  'journey-payments-trial': {
    id: 'journey-payments-trial',
    uid: '_test-journey-payments-trial',
    email: '_test.journey-payments-trial@{domain}',
    properties: {
      roles: {},
      subscription: { product: { id: 'basic' }, status: 'active' }, // Starts as basic, upgraded via trial webhook
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
 * Get all test account definitions with resolved emails
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @returns {object} Account definitions with resolved emails
 */
function getAccountDefinitions(domain) {
  const accounts = {};

  for (const [key, account] of Object.entries(TEST_ACCOUNTS)) {
    accounts[key] = {
      id: account.id,
      uid: account.uid,
      email: account.email.replace('{domain}', domain),
      properties: account.properties,
    };
  }

  return accounts;
}

/**
 * Fetch privateKeys for test accounts from Firestore
 * @param {object} admin - Firebase admin instance
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @returns {Promise<object>} Account credentials with privateKeys
 */
async function fetchPrivateKeys(admin, domain) {
  const definitions = getAccountDefinitions(domain);
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

  // Create Firebase Auth user - triggers auth:on-create
  await admin.auth().createUser({
    uid: account.uid,
    email: account.email,
    password: uuid.v4(),
    emailVerified: true,
  });

  // Wait for auth:on-create to COMPLETE
  // We check for metadata.tag which is set at the END of on-create
  const maxWait = 15000;
  const pollInterval = 500;
  let waited = 0;

  while (waited < maxWait) {
    const doc = await userRef.get();
    if (doc.exists && doc.data()?.metadata?.tag === 'auth:on-create') {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
  }

  // Merge test-specific properties (roles, subscription, etc.)
  await userRef.set(account.properties, { merge: true });

  return { uid: account.uid, email: account.email };
}

/**
 * Delete all test users (both Auth and Firestore)
 * Uses TEST_ACCOUNTS as the source of truth for which UIDs to delete
 * Deleting Auth users triggers on-delete which handles Firestore doc + count decrement
 * Waits for Firestore docs to be deleted before returning to ensure clean state
 * Called before test runs to ensure clean state
 * @param {object} admin - Firebase admin instance
 * @returns {Promise<object>} Result with deleted count
 */
async function deleteTestUsers(admin) {
  const results = { deleted: [], skipped: [], failed: [] };

  // Delete all known test accounts in parallel
  await Promise.all(
    Object.values(TEST_ACCOUNTS).map(async (account) => {
      try {
        // Delete Firebase Auth user (triggers on-delete which handles Firestore doc + count)
        await admin.auth().deleteUser(account.uid);

        // Wait for on-delete handler to delete the Firestore doc
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

        // Fallback: if on-delete didn't complete in time, delete the doc directly
        if (waited >= maxWait) {
          await admin.firestore().doc(`users/${account.uid}`).delete().catch(() => {});
        }

        results.deleted.push(account.uid);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          // Auth user doesn't exist, but Firestore doc might still exist - clean it up
          await admin.firestore().doc(`users/${account.uid}`).delete().catch(() => {});
          results.skipped.push(account.uid);
        } else {
          results.failed.push({ uid: account.uid, error: error.message });
        }
      }
    })
  );

  // Clean up payment-related collections for test accounts
  const testUids = Object.values(TEST_ACCOUNTS).map(a => a.uid);
  const paymentCollections = ['payments-subscriptions', 'payments-webhooks', 'payments-intents'];

  await Promise.all(
    paymentCollections.map(async (collection) => {
      try {
        const snapshot = await admin.firestore().collection(collection)
          .where('uid', 'in', testUids)
          .get();

        await Promise.all(
          snapshot.docs.map(doc => doc.ref.delete())
        );
      } catch (e) {
        // Collection may not exist yet — ignore
      }
    })
  );

  return {
    success: results.failed.length === 0,
    deleted: results.deleted.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    errors: results.failed,
  };
}

/**
 * Create all test accounts
 * Assumes deleteTestUsers() was called first to ensure clean state
 * @param {object} admin - Firebase admin instance
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @returns {Promise<object>} Result with created/failed counts
 */
async function createTestAccounts(admin, domain) {
  const definitions = getAccountDefinitions(domain);
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

/**
 * Clean up test accounts from marketing providers (SendGrid + Beehiiv)
 * Called after account setup when TEST_EXTENDED_MODE is set to remove
 * contacts added by auth:on-create
 * @param {string} domain - Domain for email addresses
 * @param {object} options - Options with hostingUrl and backendManagerKey
 * @returns {Promise<object>} Result with cleaned count
 */
async function cleanupMarketingProviders(domain, options = {}) {
  const fetch = require('wonderful-fetch');
  const results = { cleaned: 0, errors: [] };

  const { hostingUrl, backendManagerKey } = options;
  if (!hostingUrl || !backendManagerKey) {
    console.error('cleanupMarketingProviders: Missing hostingUrl or backendManagerKey');
    return results;
  }

  // Get all test account emails (test contacts like rachel.greene+bem cleaned up by their own tests)
  const definitions = getAccountDefinitions(domain);
  const emails = Object.values(definitions).map(acc => acc.email);

  // Clean up each email via the API endpoint (uses hosting port 5002)
  await Promise.all(
    emails.map(async (email) => {
      try {
        const response = await fetch(`${hostingUrl}/backend-manager/marketing/contact`, {
          method: 'DELETE',
          response: 'json',
          timeout: 30000,
          body: {
            backendManagerKey,
            email,
          },
        });

        // Log the result for debugging
        if (response.providers?.beehiiv?.deleted) {
          results.cleaned++;
        } else if (response.providers?.beehiiv?.skipped) {
          // Skipped means not found - that's fine
          results.cleaned++;
        } else if (response.providers?.beehiiv?.error) {
          console.error(`Failed to delete ${email} from Beehiiv:`, response.providers.beehiiv.error);
          results.errors.push({ email, error: response.providers.beehiiv.error });
        } else {
          results.cleaned++;
        }
      } catch (error) {
        console.error(`Failed to cleanup ${email}:`, error.message);
        results.errors.push({ email, error: error.message });
      }
    })
  );

  return results;
}

module.exports = {
  STATIC_ACCOUNTS,
  JOURNEY_ACCOUNTS,
  TEST_ACCOUNTS,
  TEST_DATA,
  getAccountDefinitions,
  fetchPrivateKeys,
  deleteTestUsers,
  createTestAccounts,
  cleanupMarketingProviders,
};
