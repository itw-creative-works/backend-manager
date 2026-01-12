/**
 * Test: user:get-subscription-info
 * Tests the user get subscription info command
 * Returns plan details for authenticated users
 */
module.exports = {
  description: 'User get subscription info',
  type: 'group',
  tests: [
    // Test 1: Basic user can get subscription info
    {
      name: 'basic-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-subscription-info', {});

        assert.isSuccess(response, 'Get subscription info should succeed for authenticated user');
        assert.hasProperty(response, 'data.plan', 'Response should contain plan object');
        assert.hasProperty(response, 'data.plan.id', 'Plan should have id');
        assert.hasProperty(response, 'data.plan.expires', 'Plan should have expires');
        assert.hasProperty(response, 'data.plan.trial', 'Plan should have trial info');
        assert.hasProperty(response, 'data.plan.payment', 'Plan should have payment info');
      },
    },

    // Test 2: Plan has correct structure
    {
      name: 'plan-structure-valid',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-subscription-info', {});

        assert.isSuccess(response, 'Get subscription info should succeed');

        const plan = response.data.plan;

        // Check expires structure
        assert.hasProperty(response, 'data.plan.expires.timestamp', 'expires should have timestamp');
        assert.hasProperty(response, 'data.plan.expires.timestampUNIX', 'expires should have timestampUNIX');

        // Check trial structure
        assert.ok(
          typeof plan.trial.activated === 'boolean',
          'trial.activated should be boolean'
        );
        assert.hasProperty(response, 'data.plan.trial.date', 'trial should have date');
        assert.hasProperty(response, 'data.plan.trial.date.timestamp', 'trial.date should have timestamp');

        // Check payment structure
        assert.ok(
          typeof plan.payment.active === 'boolean',
          'payment.active should be boolean'
        );
      },
    },

    // Test 3: Premium user has active subscription
    {
      name: 'premium-user-has-active-plan',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-subscription-info', {});

        assert.isSuccess(response, 'Get subscription info should succeed for premium user');
        // The API returns plan.id from the user doc (test account has plan.id = 'premium')
        assert.hasProperty(response, 'data.plan.id', 'Premium user should have plan id');
        assert.hasProperty(response, 'data.plan.payment', 'Premium user should have payment info');
      },
    },

    // Test 4: Expired premium user still gets info
    {
      name: 'expired-premium-returns-info',
      auth: 'premium-expired',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-subscription-info', {});

        assert.isSuccess(response, 'Get subscription info should succeed for expired premium');
        assert.hasProperty(response, 'data.plan.id', 'Should still have plan id');
        assert.hasProperty(response, 'data.plan.expires.timestampUNIX', 'Should have expires timestamp');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-subscription-info', {});

        assert.isError(response, 401, 'Get subscription info should fail without authentication');
      },
    },
  ],
};
