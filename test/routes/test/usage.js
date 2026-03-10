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
        state.initialMonthly = state.initialUsage?.requests?.monthly || 0;
        state.initialDaily = state.initialUsage?.requests?.daily || 0;
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

        // Verify monthly incremented
        assert.equal(
          response.data.after.monthly,
          response.data.before.monthly + 1,
          'Monthly should be incremented by 1'
        );

        // Verify daily incremented
        assert.equal(
          response.data.after.daily,
          response.data.before.daily + 1,
          'Daily should be incremented by 1'
        );

        // Verify total incremented
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
          userDoc.usage.requests.monthly,
          state.afterFirstIncrement.monthly,
          'Persisted monthly should match API response'
        );
        assert.equal(
          userDoc.usage.requests.daily,
          state.afterFirstIncrement.daily,
          'Persisted daily should match API response'
        );
        assert.equal(
          userDoc.usage.requests.total,
          state.afterFirstIncrement.total,
          'Persisted total should match API response'
        );

        // Verify last timestamp exists
        assert.ok(userDoc.usage.requests.last, 'Should have last object');
        assert.ok(userDoc.usage.requests.last.timestamp, 'Should have last.timestamp');
        assert.ok(userDoc.usage.requests.last.timestampUNIX, 'Should have last.timestampUNIX');
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

        // Verify all counters incremented by 5
        assert.equal(
          response.data.after.monthly,
          response.data.before.monthly + 5,
          'Monthly should be incremented by 5'
        );
        assert.equal(
          response.data.after.daily,
          response.data.before.daily + 5,
          'Daily should be incremented by 5'
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
          userDoc.usage.requests.monthly,
          state.afterCustomAmount.monthly,
          'Requests monthly should be persisted'
        );
        assert.equal(
          userDoc.usage.requests.daily,
          state.afterCustomAmount.daily,
          'Requests daily should be persisted'
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
        const expectedMonthly = state.initialMonthly + 11;
        const expectedDaily = state.initialDaily + 11;
        const expectedTotal = state.initialTotal + 11;

        assert.equal(
          response3.data.after.monthly,
          expectedMonthly,
          `Monthly should accumulate to ${expectedMonthly}`
        );
        assert.equal(
          response3.data.after.daily,
          expectedDaily,
          `Daily should accumulate to ${expectedDaily}`
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
        // Unauthenticated requests use IP as key (no proxy headers in emulator, so falls back to 'unknown')
        state.unauthKey = 'unknown';

        const response = await http.as('none').post('test/usage', {});

        assert.isSuccess(response, 'Unauthenticated usage increment should succeed');
        assert.equal(response.data.authenticated, false, 'Should report as unauthenticated');
        assert.equal(response.data.key, state.unauthKey, 'Key should be unknown');

        // Verify all counters incremented
        assert.equal(response.data.after.monthly, response.data.before.monthly + 1, 'Monthly should increment by 1');
        assert.equal(response.data.after.daily, response.data.before.daily + 1, 'Daily should increment by 1');

        state.unauthMonthly = response.data.after.monthly;
      },
    },

    // Test 8: Verify unauthenticated usage persisted to usage collection
    {
      name: 'verify-unauthenticated-usage-persisted',
      async run({ firestore, assert, state }) {
        const usageDoc = await firestore.get(`usage/${state.unauthKey}`);

        assert.ok(usageDoc, 'Usage doc should exist in usage collection');
        assert.ok(usageDoc?.requests, 'Usage doc should have the requests metric');
        assert.equal(usageDoc.requests.monthly, state.unauthMonthly, 'Persisted monthly should match');
      },
    },

    // Test 9: Cron resets daily counters for authenticated users
    {
      name: 'cron-resets-daily-counters',
      async run({ assert, firestore, state, accounts, waitFor, pubsub }) {
        // Verify daily counter is > 0 before cron
        const beforeDoc = await firestore.get(`users/${accounts.basic.uid}`);
        assert.ok(beforeDoc?.usage?.requests?.daily > 0, 'Daily counter should be > 0 before cron');

        // Store monthly and total before cron (should NOT be reset by daily cron)
        state.monthlyBeforeCron = beforeDoc.usage.requests.monthly;
        state.totalBeforeCron = beforeDoc.usage.requests.total;

        // Trigger cron via PubSub
        await pubsub.trigger('bm_cronDaily');

        // Wait for cron to reset daily counter
        try {
          await waitFor(
            async () => {
              const doc = await firestore.get(`users/${accounts.basic.uid}`);
              return doc?.usage?.requests?.daily === 0;
            },
            10000,
            500
          );
          assert.ok(true, 'Daily counter was reset to 0 by cron');
        } catch (error) {
          assert.fail('Daily counter should be reset to 0 within 10s');
        }
      },
    },

    // Test 10: Cron preserves monthly and total counters (non-1st of month)
    {
      name: 'cron-preserves-monthly-and-total',
      async run({ assert, firestore, state, accounts }) {
        const afterDoc = await firestore.get(`users/${accounts.basic.uid}`);

        assert.equal(
          afterDoc.usage.requests.monthly,
          state.monthlyBeforeCron,
          'Monthly counter should be preserved after daily cron'
        );
        assert.equal(
          afterDoc.usage.requests.total,
          state.totalBeforeCron,
          'Total counter should be preserved after daily cron'
        );
      },
    },

    // Test 11: Cron deletes unauthenticated usage collection
    {
      name: 'cron-deletes-unauthenticated-usage',
      async run({ assert, firestore, state, waitFor }) {
        // The cron was already triggered in test 9, so the usage collection should be deleted
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

    // Test 12: Daily counter accumulates after cron reset
    {
      name: 'daily-counter-accumulates-after-reset',
      async run({ http, assert }) {
        // After cron reset daily to 0, new increments should start from 0
        const response = await http.as('basic').post('test/usage', {
          amount: 3,
        });

        assert.isSuccess(response, 'Increment after cron reset should succeed');
        assert.equal(response.data.before.daily, 0, 'Daily should be 0 after cron reset');
        assert.equal(response.data.after.daily, 3, 'Daily should be 3 after increment');

        // Monthly should have continued accumulating (not reset)
        assert.equal(
          response.data.after.monthly,
          response.data.before.monthly + 3,
          'Monthly should continue accumulating'
        );
      },
    },
  ],
};
