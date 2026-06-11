/**
 * Boot smoke — BEM's framework self-test layer.
 *
 * Runs ONLY when `npx mgr test` is invoked from the backend-manager repo (the
 * runner points BEM_TEST_BOOT_PROJECT at src/test/fixtures/firebase-project and
 * sets isFrameworkSelfTest). It proves the whole self-test path works end to end:
 * the fixture's functions/index.js boots `Manager.init()` inside the emulator, the
 * `bm_api` function is wired, and the hosting rewrite routes to it.
 *
 * This is BEM's equivalent of BXM's `boot/extension-loads` and UJM's site-boot
 * smoke. It is EXCLUDED from real-consumer runs (see runner.js discoverTests).
 */
module.exports = {
  description: 'Boot smoke — fixture emulator + bm_api reachable',
  type: 'group',
  timeout: 30000,

  tests: [
    {
      name: 'bm_api-health-responds-over-hosting-rewrite',
      async run({ http, assert }) {
        const response = await http.get('backend-manager/test/health');
        assert.isSuccess(response, 'bm_api /test/health should respond through the emulator hosting rewrite');
      },
    },
    {
      name: 'manager-booted-in-functions-runtime',
      async run({ http, assert }) {
        // /test/health is served by the bm_api function, which only exists if
        // Manager.init() ran in the fixture's functions runtime. A success here
        // means the local backend-manager (symlinked into the fixture) booted.
        const response = await http.get('backend-manager/test/health');
        assert.isSuccess(response, 'Manager.init() should have wired bm_api in the fixture functions runtime');
      },
    },
  ],
};
