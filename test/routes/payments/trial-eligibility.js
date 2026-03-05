/**
 * Test: GET /payments/trial-eligibility
 * Tests trial eligibility check based on subscription order history
 */
module.exports = {
  description: 'Trial eligibility check',
  type: 'group',
  timeout: 15000,

  tests: [
    {
      name: 'rejects-unauthenticated',
      async run({ http, assert }) {
        const response = await http.as('none').get('payments/trial-eligibility');

        assert.isError(response, 401, 'Should reject unauthenticated request');
      },
    },

    {
      name: 'eligible-when-no-orders',
      async run({ http, assert }) {
        // Basic user with no subscription history should be eligible
        const response = await http.as('basic').get('payments/trial-eligibility');

        assert.isSuccess(response, 'Should succeed for authenticated user');
        assert.equal(response.data.eligible, true, 'Should be eligible with no order history');
      },
    },

    {
      name: 'ineligible-when-has-subscription-history',
      async run({ http, assert, accounts, firestore }) {
        const uid = accounts['basic'].uid;
        const orderDocPath = `payments-orders/_test-trial-eligibility-${uid}`;

        // Create fake subscription order history
        await firestore.set(orderDocPath, { owner: uid, type: 'subscription', processor: 'test', status: 'cancelled' });

        try {
          const response = await http.as('basic').get('payments/trial-eligibility');

          assert.isSuccess(response, 'Should succeed for authenticated user');
          assert.equal(response.data.eligible, false, 'Should be ineligible with subscription history');
        } finally {
          await firestore.delete(orderDocPath);
        }
      },
    },

    {
      name: 'eligible-when-only-non-subscription-orders',
      async run({ http, assert, accounts, firestore }) {
        const uid = accounts['basic'].uid;
        const orderDocPath = `payments-orders/_test-trial-eligibility-onetime-${uid}`;

        // Create a non-subscription order (one-time purchase)
        await firestore.set(orderDocPath, { owner: uid, type: 'one-time', processor: 'test', status: 'completed' });

        try {
          const response = await http.as('basic').get('payments/trial-eligibility');

          assert.isSuccess(response, 'Should succeed for authenticated user');
          assert.equal(response.data.eligible, true, 'Should be eligible — only non-subscription orders');
        } finally {
          await firestore.delete(orderDocPath);
        }
      },
    },
  ],
};
