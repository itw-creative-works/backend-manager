/**
 * Test: GET /user/subscription
 * Tests the user get subscription info endpoint
 * Returns subscription details for authenticated users
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
        const response = await http.get('user/subscription', {});

        assert.isSuccess(response, 'Get subscription info should succeed for authenticated user');
        assert.hasProperty(response, 'data.subscription', 'Response should contain subscription object');
        assert.hasProperty(response, 'data.subscription.product.id', 'Subscription should have id');
        assert.hasProperty(response, 'data.subscription.expires', 'Subscription should have expires');
        assert.hasProperty(response, 'data.subscription.trial', 'Subscription should have trial info');
        assert.hasProperty(response, 'data.subscription.payment', 'Subscription should have payment info');
      },
    },

    // Test 2: Subscription has correct structure
    {
      name: 'subscription-structure-valid',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/subscription', {});

        assert.isSuccess(response, 'Get subscription info should succeed');

        const subscription = response.data.subscription;

        // Check expires structure
        assert.hasProperty(response, 'data.subscription.expires.timestamp', 'expires should have timestamp');
        assert.hasProperty(response, 'data.subscription.expires.timestampUNIX', 'expires should have timestampUNIX');

        // Check trial structure
        assert.ok(
          typeof subscription.trial.claimed === 'boolean',
          'trial.claimed should be boolean'
        );

        // Check payment structure
        assert.hasProperty(response, 'data.subscription.payment', 'subscription should have payment');
      },
    },

    // Test 3: Premium user has active subscription
    {
      name: 'premium-user-has-active-subscription',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/subscription', {});

        assert.isSuccess(response, 'Get subscription info should succeed for premium user');
        assert.hasProperty(response, 'data.subscription.product.id', 'Premium user should have subscription id');
        assert.hasProperty(response, 'data.subscription.payment', 'Premium user should have payment info');
      },
    },

    // Test 4: Expired premium user still gets info
    {
      name: 'expired-premium-returns-info',
      auth: 'premium-expired',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/subscription', {});

        assert.isSuccess(response, 'Get subscription info should succeed for expired premium');
        assert.hasProperty(response, 'data.subscription.product.id', 'Should still have subscription id');
        assert.hasProperty(response, 'data.subscription.expires.timestampUNIX', 'Should have expires timestamp');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/subscription', {});

        assert.isError(response, 401, 'Get subscription info should fail without authentication');
      },
    },
  ],
};
