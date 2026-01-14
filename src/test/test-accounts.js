const uuid = require('uuid');

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
 */
const STATIC_ACCOUNTS = {
  admin: {
    id: 'admin',
    uid: '_test-admin',
    email: '_test.admin@{domain}',
    properties: {
      roles: { admin: true },
      plan: { id: 'basic', status: 'active' },
    },
  },
  basic: {
    id: 'basic',
    uid: '_test-basic',
    email: '_test.basic@{domain}',
    properties: {
      roles: {},
      plan: { id: 'basic', status: 'active' },
    },
  },
  'premium-active': {
    id: 'premium-active',
    uid: '_test-premium-active',
    email: '_test.premium-active@{domain}',
    properties: {
      roles: {},
      plan: { id: 'premium', status: 'active' },
    },
  },
  'premium-expired': {
    id: 'premium-expired',
    uid: '_test-premium-expired',
    email: '_test.premium-expired@{domain}',
    properties: {
      roles: {},
      plan: { id: 'premium', status: 'cancelled' },
    },
  },
  delete: {
    id: 'delete',
    uid: '_test-delete',
    email: '_test.delete@{domain}',
    properties: {
      roles: {},
      plan: { id: 'premium', status: 'active' }, // Active subscription - deletion should be blocked initially
    },
  },
  'delete-by-admin': {
    id: 'delete-by-admin',
    uid: '_test-delete-by-admin',
    email: '_test.delete-by-admin@{domain}',
    properties: {
      roles: {},
      // No plan - can be deleted immediately by admin
    },
  },
  referrer: {
    id: 'referrer',
    uid: '_test-referrer',
    email: '_test.referrer@{domain}',
    properties: {
      roles: {},
      plan: { id: 'basic', status: 'active' },
      affiliate: { code: 'TESTREF', referrals: [] },
    },
  },
  referred: {
    id: 'referred',
    uid: '_test-referred',
    email: '_test.referred@{domain}',
    properties: {
      roles: {},
      plan: { id: 'basic', status: 'active' },
    },
  },
  'referred-invalid': {
    id: 'referred-invalid',
    uid: '_test-referred-invalid',
    email: '_test.referred-invalid@{domain}',
    properties: {
      roles: {},
      plan: { id: 'basic', status: 'active' },
    },
  },
};

/**
 * Journey test accounts - for testing subscription/payment flows
 * These accounts transition through states via webhook tests
 */
const JOURNEY_ACCOUNTS = {
  'journey-upgrade': {
    id: 'journey-upgrade',
    uid: '_test-journey-upgrade',
    email: '_test.journey-upgrade@{domain}',
    properties: {
      roles: {},
      plan: { id: 'basic', status: 'active' }, // Starts as basic, upgraded via Stripe webhook
    },
  },
  'journey-cancel': {
    id: 'journey-cancel',
    uid: '_test-journey-cancel',
    email: '_test.journey-cancel@{domain}',
    properties: {
      roles: {},
      plan: { id: 'premium', status: 'active' }, // Starts as premium, cancelled via Stripe webhook
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
 * Ensure a single test account exists
 * Creates Firebase Auth user if missing, waits for auth:on-create to create Firestore doc,
 * then merges test-specific properties
 * @param {object} admin - Firebase admin instance
 * @param {object} account - Account definition with uid, email, properties
 * @returns {Promise<object>} Result { created, uid, email }
 */
async function ensureAccount(admin, account) {
  const userRef = admin.firestore().doc(`users/${account.uid}`);

  // Check if user already exists in Auth
  let authUserExists = false;
  try {
    await admin.auth().getUser(account.uid);
    authUserExists = true;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  // If auth user exists, just merge properties
  if (authUserExists) {
    await userRef.set(account.properties, { merge: true });
    return { created: false, uid: account.uid, email: account.email };
  }

  // Clean up orphaned Firestore doc if exists
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    await userRef.delete();
  }

  // Create Firebase Auth user - triggers auth:on-create
  await admin.auth().createUser({
    uid: account.uid,
    email: account.email,
    password: uuid.v4(),
    emailVerified: true,
  });

  // Wait for auth:on-create to complete (creates api.clientId, etc.)
  const maxWait = 15000;
  const pollInterval = 500;
  let waited = 0;

  while (waited < maxWait) {
    const doc = await userRef.get();
    if (doc.exists && doc.data()?.api?.clientId) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
  }

  // Merge test-specific properties
  await userRef.set(account.properties, { merge: true });

  return { created: true, uid: account.uid, email: account.email };
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

  return {
    success: results.failed.length === 0,
    deleted: results.deleted.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    errors: results.failed,
  };
}

/**
 * Ensure all test accounts exist (creates if missing)
 * Called directly with Firebase Admin SDK - no HTTP call
 * @param {object} admin - Firebase admin instance
 * @param {string} domain - Domain for email addresses (e.g., 'itwcreativeworks.com')
 * @returns {Promise<object>} Result with created/skipped/failed counts
 */
async function ensureAccountsExist(admin, domain) {
  const definitions = getAccountDefinitions(domain);
  const results = { created: [], skipped: [], failed: [] };

  // Create all accounts in parallel
  const entries = Object.entries(definitions);
  await Promise.all(
    entries.map(async ([key, account]) => {
      try {
        const result = await ensureAccount(admin, account);

        if (result.created) {
          results.created.push({ id: key, uid: account.uid, email: account.email });
        } else {
          results.skipped.push({ id: key, uid: account.uid, email: account.email });
        }
      } catch (error) {
        results.failed.push({ id: key, uid: account.uid, email: account.email, error: error.message });
      }
    })
  );

  return {
    success: results.failed.length === 0,
    created: results.created.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    accounts: [...results.created, ...results.skipped],
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
 * @param {object} options - Options with apiUrl and backendManagerKey
 * @returns {Promise<object>} Result with cleaned count
 */
async function cleanupMarketingProviders(domain, options = {}) {
  const fetch = require('wonderful-fetch');
  const results = { cleaned: 0, errors: [] };

  const { apiUrl, backendManagerKey } = options;
  if (!apiUrl || !backendManagerKey) {
    console.error('cleanupMarketingProviders: Missing apiUrl or backendManagerKey');
    return results;
  }

  // Get all test account emails (test contacts like rachel.greene+bem cleaned up by their own tests)
  const definitions = getAccountDefinitions(domain);
  const emails = Object.values(definitions).map(acc => acc.email);

  // Clean up each email via the API endpoint (uses hosting port 5002)
  await Promise.all(
    emails.map(async (email) => {
      try {
        const response = await fetch(`${apiUrl}/backend-manager`, {
          method: 'post',
          response: 'json',
          timeout: 30000,
          body: {
            backendManagerKey,
            command: 'general:remove-marketing-contact',
            payload: { email },
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
  ensureAccountsExist,
  cleanupMarketingProviders,
};
