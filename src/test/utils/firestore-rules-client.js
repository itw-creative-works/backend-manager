/**
 * Firestore Rules Testing Client
 *
 * Creates authenticated Firestore clients that respect security rules.
 * Uses @firebase/rules-unit-testing to simulate authenticated users.
 *
 * This is different from the admin SDK (which bypasses rules) - these clients
 * are subject to the same security rules as real client apps.
 *
 * @see https://firebase.google.com/docs/firestore/security/test-rules-emulator
 */
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const jetpack = require('fs-jetpack');
const path = require('path');
const { TEST_DATA } = require('../test-accounts.js');

let testEnv = null;

/**
 * Initialize the test environment
 * Must be called before using any rules testing functions
 *
 * @param {object} options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.rulesPath - Path to firestore.rules file (optional)
 * @param {string} options.host - Emulator host (default: 127.0.0.1)
 * @param {number} options.port - Emulator port (default: 8080)
 */
async function initRulesTestEnv(options) {
  options = options || {};

  const projectId = options.projectId || process.env.GCLOUD_PROJECT || TEST_DATA.defaultProjectId;
  const host = options.host || '127.0.0.1';
  const port = options.port || 8080;

  // Load rules from file if path provided
  let rules = null;
  if (options.rulesPath && jetpack.exists(options.rulesPath)) {
    rules = jetpack.read(options.rulesPath);
  }

  const config = {
    projectId,
    firestore: {
      host,
      port,
    },
  };

  // Only add rules if we have them
  if (rules) {
    config.firestore.rules = rules;
  }

  testEnv = await initializeTestEnvironment(config);

  return testEnv;
}

/**
 * Get the test environment (initialize if needed)
 */
async function getTestEnv(options) {
  if (!testEnv) {
    await initRulesTestEnv(options);
  }
  return testEnv;
}

/**
 * Create an authenticated Firestore client
 * This client is subject to security rules as if it were a real authenticated user
 *
 * @param {string} uid - User UID to authenticate as
 * @param {object} claims - Additional auth claims (email, admin, etc.)
 * @returns {object} Firestore instance with authenticated context
 */
function getAuthenticatedFirestore(uid, claims) {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initRulesTestEnv() first.');
  }

  claims = claims || {};

  // Build token options - v5 automatically sets sub/user_id from first param
  const tokenOptions = {
    email: claims.email || `${uid}@test.com`,
    ...claims,
  };

  const context = testEnv.authenticatedContext(uid, tokenOptions);
  return context.firestore();
}

/**
 * Create an unauthenticated Firestore client
 * This client is subject to security rules as if no user is signed in
 *
 * @returns {object} Firestore instance without authentication
 */
function getUnauthenticatedFirestore() {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initRulesTestEnv() first.');
  }

  const context = testEnv.unauthenticatedContext();
  return context.firestore();
}

/**
 * Clean up test environment
 * Call this after all tests are complete
 */
async function cleanupTestEnv() {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * Clear all Firestore data in the emulator
 * Useful between tests for clean state
 */
async function clearFirestore() {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initRulesTestEnv() first.');
  }
  await testEnv.clearFirestore();
}

/**
 * Helper to test that an operation succeeds
 * @param {Promise} operation - Firestore operation promise
 * @returns {Promise} Resolves if operation succeeds, rejects otherwise
 */
async function expectSuccess(operation) {
  return assertSucceeds(operation);
}

/**
 * Helper to test that an operation fails (permission denied)
 * @param {Promise} operation - Firestore operation promise
 * @returns {Promise} Resolves if operation fails, rejects if it succeeds
 */
async function expectFailure(operation) {
  return assertFails(operation);
}

/**
 * Seed test account documents into Firestore (bypasses security rules)
 * This is needed because security rules like isAdmin() read from Firestore documents
 *
 * @param {object} accounts - Test accounts object with uid, email, etc.
 */
async function seedTestAccounts(accounts) {
  if (!testEnv) {
    throw new Error('Test environment not initialized. Call initRulesTestEnv() first.');
  }

  // Get static account definitions for roles/plan data
  const { TEST_ACCOUNTS } = require('../test-accounts.js');

  // Use withSecurityRulesDisabled to write test data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const [accountType, account] of Object.entries(accounts)) {
      if (!account.uid) {
        continue;
      }

      // Get the static definition for this account type (has roles, plan)
      const staticDef = TEST_ACCOUNTS[accountType];

      // Build user document with roles for isAdmin() check
      const userData = {
        auth: {
          uid: account.uid,
          email: account.email,
        },
        roles: staticDef?.properties?.roles || {},
      };

      // Add plan if present in static definition
      if (staticDef?.properties?.plan) {
        userData.plan = staticDef.properties.plan;
      }

      await db.doc(`users/${account.uid}`).set(userData, { merge: true });
    }
  });
}

/**
 * Create a rules testing context for use in BEM tests
 *
 * @param {object} options
 * @param {string} options.projectId - Firebase project ID
 * @param {object} options.accounts - Test accounts object
 * @returns {object} Rules testing context
 */
async function createRulesContext(options) {
  options = options || {};

  await getTestEnv(options);

  // Seed test account documents so rules like isAdmin() work
  if (options.accounts) {
    await seedTestAccounts(options.accounts);
  }

  return {
    /**
     * Get Firestore client authenticated as a specific user
     * @param {string} uid - User UID
     * @param {object} claims - Additional claims
     */
    asUser: (uid, claims) => getAuthenticatedFirestore(uid, claims),

    /**
     * Get Firestore client authenticated as a test account
     * @param {string} accountType - 'basic', 'admin', 'premium-active', etc.
     */
    asAccount: (accountType) => {
      const account = options.accounts?.[accountType];
      if (!account) {
        throw new Error(`Unknown account type: ${accountType}`);
      }

      const claims = {
        email: account.email,
      };

      // Add admin claim if this is the admin account
      if (accountType === 'admin' || account.roles?.admin) {
        claims.admin = true;
      }

      return getAuthenticatedFirestore(account.uid, claims);
    },

    /**
     * Get unauthenticated Firestore client
     */
    asAnonymous: () => getUnauthenticatedFirestore(),

    /**
     * Assert that operation succeeds
     */
    expectSuccess,

    /**
     * Assert that operation fails (permission denied)
     */
    expectFailure,

    /**
     * Clear all Firestore data
     */
    clearData: clearFirestore,

    /**
     * Cleanup (call after tests)
     */
    cleanup: cleanupTestEnv,
  };
}

module.exports = {
  initRulesTestEnv,
  getTestEnv,
  getAuthenticatedFirestore,
  getUnauthenticatedFirestore,
  cleanupTestEnv,
  clearFirestore,
  expectSuccess,
  expectFailure,
  createRulesContext,
};
