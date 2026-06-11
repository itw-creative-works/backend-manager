/**
 * Test lifecycle hook for this project. Runs before any test (not a test itself).
 * See backend-manager/docs/test-framework.md → "test/_init.js".
 */

module.exports = ({ config }) => ({
  // Extra test accounts (one per lifecycle this project exercises):
  // { id, uid, email, properties }. email may use the {domain} placeholder.
  accounts: [],

  // Seed fixtures into the freshly-flushed emulator, after accounts are created.
  async setup({ admin, accounts }) {
  },
});
