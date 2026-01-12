/**
 * Test: user:regenerate-api-keys
 * Tests the user regenerate API keys command
 * This is a suite because we need to track state and restore original keys
 */
module.exports = {
  description: 'User regenerate API keys',
  type: 'suite',
  timeout: 30000,

  tests: [
    // Test 1: Store original keys
    {
      name: 'store-original-keys',
      async run({ firestore, assert, state, accounts }) {
        // Get the basic account's current keys to restore later
        const userDoc = await firestore.get(`users/${accounts.basic.uid}`);

        assert.ok(userDoc, 'User doc should exist');
        assert.hasProperty({ data: userDoc }, 'data.api.clientId', 'User should have clientId');
        assert.hasProperty({ data: userDoc }, 'data.api.privateKey', 'User should have privateKey');

        state.originalClientId = userDoc.api.clientId;
        state.originalPrivateKey = userDoc.api.privateKey;

        assert.ok(state.originalClientId, 'Original clientId should exist');
        assert.ok(state.originalPrivateKey, 'Original privateKey should exist');
      },
    },

    // Test 2: Regenerate both keys (default)
    {
      name: 'regenerate-both-keys',
      async run({ http, assert, state }) {
        const response = await http.as('basic').command('user:regenerate-api-keys', {});

        assert.isSuccess(response, 'Regenerate API keys should succeed');
        assert.hasProperty(response, 'data.clientId', 'Response should contain new clientId');
        assert.hasProperty(response, 'data.privateKey', 'Response should contain new privateKey');

        // Keys should be different from original
        assert.notEqual(
          response.data.clientId,
          state.originalClientId,
          'New clientId should be different from original'
        );
        assert.notEqual(
          response.data.privateKey,
          state.originalPrivateKey,
          'New privateKey should be different from original'
        );

        // Store new keys for verification
        state.newClientId = response.data.clientId;
        state.newPrivateKey = response.data.privateKey;
      },
    },

    // Test 3: Verify keys are persisted in Firestore
    {
      name: 'verify-keys-persisted',
      async run({ firestore, assert, state, accounts }) {
        const userDoc = await firestore.get(`users/${accounts.basic.uid}`);

        assert.equal(
          userDoc.api.clientId,
          state.newClientId,
          'Persisted clientId should match returned value'
        );
        assert.equal(
          userDoc.api.privateKey,
          state.newPrivateKey,
          'Persisted privateKey should match returned value'
        );
      },
    },

    // Test 4: Regenerate only clientId
    // Note: After test 2, the privateKey changed so we need to use the new one
    {
      name: 'regenerate-only-clientId',
      async run({ http, assert, state }) {
        // Use the new privateKey from test 2 since old one is invalid
        const response = await http.withPrivateKey(state.newPrivateKey).command('user:regenerate-api-keys', {
          keys: ['clientId'],
        });

        assert.isSuccess(response, 'Regenerate clientId only should succeed');
        assert.hasProperty(response, 'data.clientId', 'Response should contain new clientId');
        assert.ok(
          !response.data.privateKey,
          'Response should NOT contain privateKey when only clientId requested'
        );
        assert.notEqual(
          response.data.clientId,
          state.newClientId,
          'New clientId should be different from previous'
        );
      },
    },

    // Test 5: Regenerate only privateKey
    {
      name: 'regenerate-only-privateKey',
      async run({ http, assert, state, accounts, firestore }) {
        // Get current clientId to verify it stays the same
        const beforeDoc = await firestore.get(`users/${accounts.basic.uid}`);
        const currentClientId = beforeDoc.api.clientId;

        // Still use newPrivateKey since test 4 didn't change it
        const response = await http.withPrivateKey(state.newPrivateKey).command('user:regenerate-api-keys', {
          keys: ['privateKey'],
        });

        assert.isSuccess(response, 'Regenerate privateKey only should succeed');
        assert.hasProperty(response, 'data.privateKey', 'Response should contain new privateKey');
        assert.ok(
          !response.data.clientId,
          'Response should NOT contain clientId when only privateKey requested'
        );

        // Verify clientId stayed the same
        const afterDoc = await firestore.get(`users/${accounts.basic.uid}`);
        assert.equal(
          afterDoc.api.clientId,
          currentClientId,
          'clientId should remain unchanged when only privateKey regenerated'
        );
      },
    },

    // Test 6: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      async run({ http, assert }) {
        const response = await http.as('none').command('user:regenerate-api-keys', {});

        assert.isError(response, 401, 'Regenerate API keys should fail without authentication');
      },
    },

    // Test 7: Restore original keys
    {
      name: 'restore-original-keys',
      async run({ firestore, state, accounts }) {
        // Restore original keys so other tests aren't affected
        await firestore.set(`users/${accounts.basic.uid}`, {
          api: {
            clientId: state.originalClientId,
            privateKey: state.originalPrivateKey,
          },
        }, { merge: true });
      },
    },
  ],
};
