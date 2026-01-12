/**
 * Test: Firestore Security Rules - User Documents
 * Tests that security rules correctly protect user data
 *
 * Rules being tested:
 * - Users can read their own document
 * - Users can write to their own document (non-protected fields only)
 * - Users cannot read/write other users' documents
 * - Protected fields (auth, roles, flags, plan, affiliate, api, usage) cannot be written by users
 *
 * @see templates/firestore.rules
 */
module.exports = {
  description: 'Firestore security rules for user documents',
  type: 'group',
  timeout: 30000,

  tests: [
    // Test 1: User can read their own document
    {
      name: 'user-can-read-own-doc',
      auth: 'none', // We use rules context, not http auth

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should succeed - reading own document
        await rules.expectSuccess(
          db.doc(`users/${uid}`).get()
        );
      },
    },

    // Test 2: User cannot read another user's document
    {
      name: 'user-cannot-read-other-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const otherUid = accounts.admin.uid;
        const db = rules.asAccount('basic');

        // Should fail - reading another user's document
        await rules.expectFailure(
          db.doc(`users/${otherUid}`).get()
        );
      },
    },

    // Test 3: Unauthenticated user cannot read any user document
    {
      name: 'anonymous-cannot-read-user-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAnonymous();

        // Should fail - unauthenticated read
        await rules.expectFailure(
          db.doc(`users/${uid}`).get()
        );
      },
    },

    // Test 4: User can write non-protected fields to own document
    {
      name: 'user-can-write-non-protected-fields',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should succeed - writing allowed fields
        await rules.expectSuccess(
          db.doc(`users/${uid}`).set({
            profile: {
              displayName: 'Test User',
              bio: 'This is my bio',
            },
            preferences: {
              theme: 'dark',
              notifications: true,
            },
          }, { merge: true })
        );
      },
    },

    // Test 5: User cannot write 'auth' field (protected)
    {
      name: 'user-cannot-write-auth-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - auth is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            auth: {
              uid: 'hacked-uid',
              email: 'hacked@example.com',
            },
          }, { merge: true })
        );
      },
    },

    // Test 6: User cannot write 'roles' field (protected)
    {
      name: 'user-cannot-write-roles-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - roles is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            roles: {
              admin: true,
            },
          }, { merge: true })
        );
      },
    },

    // Test 7: User cannot write 'plan' field (protected)
    {
      name: 'user-cannot-write-plan-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - plan is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            plan: {
              id: 'premium',
              status: 'active',
            },
          }, { merge: true })
        );
      },
    },

    // Test 8: User cannot write 'api' field (protected - contains privateKey)
    {
      name: 'user-cannot-write-api-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - api is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            api: {
              privateKey: 'stolen-key',
              clientId: 'fake-client',
            },
          }, { merge: true })
        );
      },
    },

    // Test 9: User cannot write 'flags' field (protected - system flags)
    {
      name: 'user-cannot-write-flags-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - flags is protected
        // Use a unique value to ensure isUpdatingField triggers
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            flags: {
              hacked: true,
            },
          }, { merge: true })
        );
      },
    },

    // Test 10: User cannot write 'usage' field (protected - tracked by server)
    {
      name: 'user-cannot-write-usage-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - usage is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            usage: {
              requests: 0, // Try to reset usage
            },
          }, { merge: true })
        );
      },
    },

    // Test 11: User cannot write 'affiliate' field (protected)
    {
      name: 'user-cannot-write-affiliate-field',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        // Should fail - affiliate is protected
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            affiliate: {
              code: 'STOLEN',
              referrals: [],
            },
          }, { merge: true })
        );
      },
    },

    // Test 12: User cannot write to another user's document
    {
      name: 'user-cannot-write-other-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const otherUid = accounts['premium-active'].uid;
        const db = rules.asAccount('basic');

        // Should fail - writing to another user's document
        await rules.expectFailure(
          db.doc(`users/${otherUid}`).set({
            profile: { hacked: true },
          }, { merge: true })
        );
      },
    },

    // Test 13: Unauthenticated user cannot write to any user document
    {
      name: 'anonymous-cannot-write-user-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAnonymous();

        // Should fail - unauthenticated write
        await rules.expectFailure(
          db.doc(`users/${uid}`).set({
            profile: { displayName: 'Anonymous Hacker' },
          }, { merge: true })
        );
      },
    },

    // Test 14: Admin can read any user's document
    {
      name: 'admin-can-read-any-user-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const basicUid = accounts.basic.uid;
        const db = rules.asAccount('admin');

        // Should succeed - admin can read any user doc
        await rules.expectSuccess(
          db.doc(`users/${basicUid}`).get()
        );
      },
    },

    // Test 15: Admin can write any user's document
    {
      name: 'admin-can-write-any-user-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const basicUid = accounts.basic.uid;
        const db = rules.asAccount('admin');

        // Should succeed - admin can write any user doc
        await rules.expectSuccess(
          db.doc(`users/${basicUid}`).set({
            profile: { updatedByAdmin: true },
          }, { merge: true })
        );
      },
    },

    // Test 16: Admin can write protected fields
    {
      name: 'admin-can-write-protected-fields',
      auth: 'none',

      async run({ rules, accounts }) {
        const basicUid = accounts.basic.uid;
        const db = rules.asAccount('admin');

        // Should succeed - admin can write protected fields
        await rules.expectSuccess(
          db.doc(`users/${basicUid}`).set({
            roles: { premium: true },
            plan: { id: 'pro', status: 'active' },
          }, { merge: true })
        );
      },
    },

    // Test 17: Admin can create a user document
    {
      name: 'admin-can-create-user-doc',
      auth: 'none',

      async run({ rules }) {
        const db = rules.asAccount('admin');
        const newUid = '_test-new-user-by-admin';

        // Should succeed - admin can create any user doc
        await rules.expectSuccess(
          db.doc(`users/${newUid}`).set({
            auth: { uid: newUid, email: 'new@test.com' },
            roles: {},
            plan: { id: 'basic', status: 'active' },
          })
        );
      },
    },

    // Test 18: Admin can delete a user document
    {
      name: 'admin-can-delete-user-doc',
      auth: 'none',

      async run({ rules, accounts }) {
        const db = rules.asAccount('admin');
        // Delete one of the seeded test accounts
        const targetUid = accounts.basic.uid;

        // Should succeed - admin can delete any user doc
        await rules.expectSuccess(
          db.doc(`users/${targetUid}`).delete()
        );
      },
    },

    // Note: User create/delete tests are omitted because users don't create or delete
    // their own documents - that's handled by system auth triggers (on-create/on-delete)
  ],
};
