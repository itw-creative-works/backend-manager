/**
 * Test: POST /marketing/webhook/forward (parent forwarder)
 *
 * This route is gated to only work when Manager.config.parent === 'self'.
 * Most test runs happen on a CHILD brand (e.g. Somiibo's backend-manager-config.json
 * has `parent: 'https://api.itwcreativeworks.com'`), so the route should return 404.
 *
 * The actual fan-out behavior (reading brands collection, derive API URLs,
 * POST to each child) is verified by unit-style tests in test/helpers/webhook-forward.js
 * which exercise the forwarder logic against a mock admin + mock fetch — no emulator
 * round-trip required.
 *
 * This file only verifies the GATE: on a non-parent BEM, the route is invisible.
 */
module.exports = {
  description: 'Marketing webhook forwarder gating (parent-only)',
  type: 'group',
  timeout: 15000,

  tests: [
    {
      name: 'forwarder-returns-404-on-non-parent-brand',
      auth: 'none',
      async run({ http, assert, config }) {
        // Sanity check: this brand should NOT be configured as the parent
        assert.ok(
          config.parent && config.parent !== 'self',
          `Test brand should have config.parent set to a URL (got: ${config.parent})`
        );

        const response = await http.as('none').post(
          `marketing/webhook/forward?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [{ sg_event_id: 'should-not-process', event: 'group_unsubscribe', email: 'test@example.com' }]
        );

        assert.isError(response, 404, 'Forwarder should be invisible (404) on non-parent BEMs');
      },
    },

    {
      name: 'forwarder-returns-404-even-with-valid-key',
      auth: 'none',
      async run({ http, assert }) {
        // A valid key shouldn't unlock the forwarder — gate is on config.parent, not key.
        const response = await http.as('none').post(
          `marketing/webhook/forward?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          { id: 'should-not-process', event: 'subscription.unsubscribed', email: 'test@example.com' }
        );

        assert.isError(response, 404, 'Even with valid key, non-parent returns 404');
      },
    },
  ],
};
