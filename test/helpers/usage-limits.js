/**
 * Test: Usage limit semantics (helpers/usage.js)
 *
 * Negative product limits (the -1 "unlimited" config convention) must never
 * rate-limit a user. Regression: the daily-cap math turned -1 into a 0/day cap
 * that 429'd every request from unlimited-plan users.
 */
const PRODUCT_ID = 'unlimited-limits-fixture';
const TEST_UID = '_test-unlimited-limits-user';

module.exports = {
  description: 'Usage limits (negative = unlimited)',
  type: 'suite',
  timeout: 15000,

  tests: [
    {
      name: 'setup-product-and-user',
      async run({ Manager, firestore, state, assert }) {
        // Inject a fixture product into the real config (restored in cleanup)
        Manager.config.payment = Manager.config.payment || {};
        state.originalProducts = Manager.config.payment.products;
        Manager.config.payment.products = [
          ...(state.originalProducts || []),
          { id: PRODUCT_ID, type: 'subscription', limits: { requests: -1 } },
        ];

        // Seed a user on that product with existing usage (fixture seeding —
        // production code must always go through the usage helper)
        await firestore.set(`users/${TEST_UID}`, {
          subscription: { product: { id: PRODUCT_ID }, status: 'active' },
          usage: { requests: { monthly: 12345, daily: 678, total: 99999 } },
        });

        assert.ok(true, 'Fixture product and user seeded');
      },
    },
    {
      name: 'negative-limit-has-no-daily-allowance',
      async run({ Manager, state, assert }) {
        const usage = Manager.Usage();
        await usage.init(Manager.Assistant(), { log: false });
        await usage.setUser(TEST_UID);

        state.usage = usage;

        assert.equal(usage.getLimit('requests'), -1, 'Limit resolves to -1');
        assert.equal(usage.getDailyAllowance('requests'), null, 'Negative limits have no daily cap');
      },
    },
    {
      name: 'validate-resolves-for-negative-limit',
      async run({ state, assert }) {
        const result = await state.usage.validate('requests').catch((e) => e);

        assert.ok(!(result instanceof Error), 'validate() must resolve for unlimited plans regardless of usage');
      },
    },
    {
      name: 'zero-limit-still-rejects',
      async run({ Manager, firestore, assert }) {
        // Guard the other edge: a missing/0 limit must keep rejecting
        await firestore.set(`users/${TEST_UID}-zero`, {
          subscription: { product: { id: 'basic' }, status: 'active' },
          usage: { unknownmetric: { monthly: 1, daily: 1, total: 1 } },
        });

        const usage = Manager.Usage();
        await usage.init(Manager.Assistant(), { log: false });
        await usage.setUser(`${TEST_UID}-zero`);

        const result = await usage.validate('unknownmetric').catch((e) => e);

        assert.ok(result instanceof Error, 'Metrics without a configured limit must reject');
      },
    },
  ],

  async cleanup({ Manager, state }) {
    // Restore the real product list
    if (Manager?.config?.payment) {
      Manager.config.payment.products = state?.originalProducts;
    }
  },
};
