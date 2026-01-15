/**
 * Test: POST /test/usage
 * Tests the usage tracking API
 * This is a suite because we need to track state and verify increments
 */
module.exports = {
  description: 'Usage tracking API',
  type: 'suite',
  timeout: 30000,

  tests: [
    // Test 1: Store initial usage state
    {
      name: 'store-initial-usage',
      async run({ firestore, assert, state, accounts }) {
        // Get the basic account's current usage to track changes
        const userDoc = await firestore.get(`users/${accounts.basic.uid}`);

        state.initialUsage = userDoc?.usage || {};

        // Store initial values for requests metric (may not exist yet)
        state.initialPeriod = state.initialUsage?.requests?.period || 0;
        state.initialTotal = state.initialUsage?.requests?.total || 0;

        assert.ok(true, 'Initial usage state captured');
      },
    },

    // Test 2: Increment usage with default values
    {
      name: 'increment-default',
      async run({ http, assert, state }) {
        const response = await http.as('basic').post('test/usage', {});

        assert.isSuccess(response, 'Usage increment should succeed');
        assert.hasProperty(response, 'data.metric', 'Response should contain metric name');
        assert.hasProperty(response, 'data.amount', 'Response should contain amount');
        assert.hasProperty(response, 'data.before', 'Response should contain before values');
        assert.hasProperty(response, 'data.after', 'Response should contain after values');

        // Verify defaults
        assert.equal(response.data.metric, 'requests', 'Metric should be requests');
        assert.equal(response.data.amount, 1, 'Default amount should be 1');

        // Verify increment happened
        assert.equal(
          response.data.after.period,
          response.data.before.period + 1,
          'Period should be incremented by 1'
        );
        assert.equal(
          response.data.after.total,
          response.data.before.total + 1,
          'Total should be incremented by 1'
        );

        // Store for next test
        state.afterFirstIncrement = response.data.after;
      },
    },

    // Test 3: Verify usage persisted to Firestore
    {
      name: 'verify-usage-persisted',
      async run({ firestore, assert, state, accounts }) {
        const userDoc = await firestore.get(`users/${accounts.basic.uid}`);

        assert.ok(userDoc?.usage, 'User should have usage object');
        assert.ok(userDoc?.usage?.requests, 'User should have requests usage');

        assert.equal(
          userDoc.usage.requests.period,
          state.afterFirstIncrement.period,
          'Persisted period should match API response'
        );
        assert.equal(
          userDoc.usage.requests.total,
          state.afterFirstIncrement.total,
          'Persisted total should match API response'
        );
      },
    },

    // Test 4: Increment with custom amount
    {
      name: 'increment-custom-amount',
      async run({ http, assert, state }) {
        const response = await http.as('basic').post('test/usage', {
          amount: 5,
        });

        assert.isSuccess(response, 'Custom amount increment should succeed');
        assert.equal(response.data.amount, 5, 'Amount should be 5');

        // Verify increment happened with custom amount
        assert.equal(
          response.data.after.period,
          response.data.before.period + 5,
          'Period should be incremented by 5'
        );
        assert.equal(
          response.data.after.total,
          response.data.before.total + 5,
          'Total should be incremented by 5'
        );

        state.afterCustomAmount = response.data.after;
      },
    },

    // Test 5: Verify custom amount persisted
    {
      name: 'verify-custom-amount-persisted',
      async run({ firestore, assert, state, accounts }) {
        const userDoc = await firestore.get(`users/${accounts.basic.uid}`);

        assert.ok(userDoc?.usage?.requests, 'User should have requests usage');

        assert.equal(
          userDoc.usage.requests.period,
          state.afterCustomAmount.period,
          'Requests period should be persisted'
        );
        assert.equal(
          userDoc.usage.requests.total,
          state.afterCustomAmount.total,
          'Requests total should be persisted'
        );
      },
    },

    // Test 6: Multiple increments accumulate
    {
      name: 'multiple-increments-accumulate',
      async run({ http, assert, state }) {
        // First increment
        const response1 = await http.as('basic').post('test/usage', {});

        assert.isSuccess(response1, 'First increment should succeed');

        // Second increment
        const response2 = await http.as('basic').post('test/usage', {});

        assert.isSuccess(response2, 'Second increment should succeed');

        // Third increment with custom amount
        const response3 = await http.as('basic').post('test/usage', {
          amount: 3,
        });

        assert.isSuccess(response3, 'Third increment should succeed');

        // Verify accumulation: should be initial + 1 (test 2) + 5 (test 4) + 1 + 1 + 3 = initial + 11
        const expectedPeriod = state.initialPeriod + 11;
        const expectedTotal = state.initialTotal + 11;

        assert.equal(
          response3.data.after.period,
          expectedPeriod,
          `Period should accumulate to ${expectedPeriod}`
        );
        assert.equal(
          response3.data.after.total,
          expectedTotal,
          `Total should accumulate to ${expectedTotal}`
        );
      },
    },

    // Test 7: Unauthenticated usage tracks by IP in usage collection
    {
      name: 'unauthenticated-usage-by-ip',
      async run({ http, assert, state }) {
        // Unauthenticated requests use IP as key (127.0.0.1 in emulator)
        state.unauthKey = '127.0.0.1';

        const response = await http.as('none').post('test/usage', {});

        assert.isSuccess(response, 'Unauthenticated usage increment should succeed');
        assert.equal(response.data.authenticated, false, 'Should report as unauthenticated');
        assert.equal(response.data.key, state.unauthKey, 'Key should be 127.0.0.1');

        // Verify increment happened
        assert.equal(response.data.after.period, 1, 'Period should be 1 after first increment');
      },
    },

    // Test 8: Verify unauthenticated usage persisted to usage collection
    {
      name: 'verify-unauthenticated-usage-persisted',
      async run({ firestore, assert, state }) {
        const usageDoc = await firestore.get(`usage/${state.unauthKey}`);

        assert.ok(usageDoc, 'Usage doc should exist in usage collection');
        assert.ok(usageDoc?.requests, 'Usage doc should have the requests metric');
        assert.equal(usageDoc.requests.period, 1, 'Persisted period should be 1');
      },
    },

    // Test 9: Cleanup - trigger daily cron via PubSub to delete usage collection
    {
      name: 'cleanup-reset-usage',
      async run({ assert, firestore, state, waitFor, pubsub }) {
        // Verify unauthenticated usage doc exists before cron
        const beforeUsageDoc = await firestore.get(`usage/${state.unauthKey}`);
        assert.ok(beforeUsageDoc, 'Usage doc should exist before cron');

        // Trigger cron via PubSub
        await pubsub.trigger('bm_cronDaily');

        // Wait for cron to delete the usage collection doc (max 10 seconds)
        try {
          await waitFor(
            async () => {
              const doc = await firestore.get(`usage/${state.unauthKey}`);
              return !doc;
            },
            10000,
            500
          );
          assert.ok(true, 'Usage collection doc was deleted by cron');
        } catch (error) {
          assert.fail('Usage collection doc should be deleted within 10s');
        }
      },
    },
  ],
};
