/**
 * Test: GET /user
 * Tests the user resolve endpoint
 * Returns RESOLVED user account info for authenticated users
 * Validates that resolve-account correctly processes user data
 */
module.exports = {
  description: 'User resolve (account info)',
  type: 'group',
  tests: [
    // Test 1: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user', {});

        assert.isError(response, 401, 'Resolve should fail without authentication');
      },
    },

    // Test 2: Basic user - verify resolved properties
    {
      name: 'basic-user-resolved-correctly',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert, accounts }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for basic user');

        const user = response.data.user;

        // Verify auth properties
        assert.equal(user.auth.uid, accounts.basic.uid, 'UID should match test account');
        assert.equal(user.auth.email, accounts.basic.email, 'Email should match test account');
        assert.equal(user.authenticated, true, 'User should be authenticated');

        // Verify plan properties - basic user should have basic plan
        assert.equal(user.plan.id, 'basic', 'Plan ID should be basic');
        assert.equal(user.plan.status, 'active', 'Plan status should be active');

        // Verify roles - basic user has no special roles
        assert.equal(user.roles.admin, false, 'Basic user should not be admin');

        // Verify usage structure exists
        assert.ok(user.usage !== undefined, 'Usage object should be present');
        assert.ok(user.usage.requests !== undefined, 'Usage.requests should be present');
      },
    },

    // Test 3: Real admin account (_test-admin) - verify admin role from Firestore
    {
      name: 'admin-account-resolved-correctly',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert, accounts }) {
        // Authenticate with the real admin test account's privateKey
        const response = await http.withPrivateKey(accounts.admin.privateKey).get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for admin account');

        const user = response.data.user;

        // Verify auth properties - should match the real admin account
        assert.equal(user.auth.uid, accounts.admin.uid, 'UID should match admin test account');
        assert.equal(user.auth.email, accounts.admin.email, 'Email should match admin test account');
        assert.equal(user.authenticated, true, 'Should be authenticated');

        // Verify roles - admin account has roles.admin = true in Firestore
        assert.equal(user.roles.admin, true, 'Admin account should have admin role');

        // Verify plan - admin account is on basic plan
        assert.equal(user.plan.id, 'basic', 'Admin plan ID should be basic');
      },
    },

    // Test 4: backendManagerKey only - shell account with admin role, no real user
    {
      name: 'backend-manager-key-shell-account',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert, accounts }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed with backendManagerKey');

        const user = response.data.user;

        // Verify roles - backendManagerKey grants admin role
        assert.equal(user.roles.admin, true, 'backendManagerKey should grant admin role');
        assert.equal(user.authenticated, true, 'Should be authenticated');

        // Should NOT have the real admin account's UID (it's a shell account)
        assert.notEqual(user.auth.uid, accounts.admin.uid, 'Should not be the real admin account');
      },
    },

    // Test 5: Premium active user - verify premium plan is retained
    {
      name: 'premium-active-user-resolved-correctly',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert, accounts }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for premium user');

        const user = response.data.user;

        // Verify auth properties
        assert.equal(user.auth.uid, accounts['premium-active'].uid, 'UID should match premium test account');
        assert.equal(user.auth.email, accounts['premium-active'].email, 'Email should match premium test account');

        // Verify plan - premium user should retain premium plan
        assert.equal(user.plan.id, 'premium', 'Plan ID should be premium');
        assert.equal(user.plan.status, 'active', 'Plan status should be active');

        // Verify expires is in the future
        const expiresTimestamp = user.plan.expires?.timestampUNIX || 0;
        const now = Math.floor(Date.now() / 1000);
        assert.ok(expiresTimestamp > now, 'Premium plan expires should be in the future');
      },
    },

    // Test 6: Premium expired user - verify plan is downgraded to basic
    {
      name: 'premium-expired-user-downgraded',
      auth: 'premium-expired',
      timeout: 15000,

      async run({ http, assert, accounts }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for expired premium user');

        const user = response.data.user;

        // Verify auth properties
        assert.equal(user.auth.uid, accounts['premium-expired'].uid, 'UID should match expired premium test account');

        // Verify plan - expired premium should be downgraded to basic by resolve-account
        assert.equal(user.plan.id, 'basic', 'Expired premium plan should be downgraded to basic');
      },
    },
  ],
};
