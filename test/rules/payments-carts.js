/**
 * Test: Firestore Security Rules - Payments Cart Documents
 * Tests that security rules correctly protect abandoned cart data
 *
 * Rules being tested:
 * - Authenticated user can create their own cart doc with status: 'pending'
 * - Authenticated user can update their own cart doc with status: 'pending'
 * - User cannot write to another user's cart doc
 * - User cannot set status to anything other than 'pending'
 * - User can read their own cart doc
 * - User cannot read another user's cart doc
 * - Anonymous cannot create/read/update cart docs
 * - Admin can read/write any cart doc
 *
 * @see templates/firestore.rules
 */
module.exports = {
  description: 'Firestore security rules for payments-carts documents',
  type: 'group',
  timeout: 30000,

  tests: [
    // Test 1: Authenticated user can create their own cart
    {
      name: 'user-can-create-own-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        await rules.expectSuccess(
          db.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
            frequency: 'monthly',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );
      },
    },

    // Test 2: User can update their own cart (e.g., revisit checkout with different product)
    {
      name: 'user-can-update-own-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');
        const adminDb = rules.asAccount('admin');

        // Create cart as admin first
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
            frequency: 'monthly',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );

        // User overwrites with new product (full .set() to reset timer)
        await rules.expectSuccess(
          db.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'pro',
            type: 'subscription',
            frequency: 'annually',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );
      },
    },

    // Test 3: User cannot create cart for another user
    {
      name: 'user-cannot-create-other-users-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const otherUid = accounts.admin.uid;
        const db = rules.asAccount('basic');

        await rules.expectFailure(
          db.doc(`payments-carts/${otherUid}`).set({
            id: otherUid,
            owner: otherUid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
            frequency: 'monthly',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );
      },
    },

    // Test 4: User cannot set owner to a different UID
    {
      name: 'user-cannot-set-wrong-owner',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        await rules.expectFailure(
          db.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: 'someone-else',
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
            frequency: 'monthly',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );
      },
    },

    // Test 5: User cannot set status to 'completed'
    {
      name: 'user-cannot-set-status-completed',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');

        await rules.expectFailure(
          db.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'completed',
            productId: 'premium',
            type: 'subscription',
            frequency: 'monthly',
            reminderIndex: 0,
            nextReminderAt: Math.floor(Date.now() / 1000) + 900,
            metadata: {
              created: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
              updated: { timestamp: new Date().toISOString(), timestampUNIX: Math.floor(Date.now() / 1000) },
            },
          })
        );
      },
    },

    // Test 6: User can read their own cart
    {
      name: 'user-can-read-own-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');
        const adminDb = rules.asAccount('admin');

        // Create cart as admin
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // User can read their own
        await rules.expectSuccess(
          db.doc(`payments-carts/${uid}`).get()
        );
      },
    },

    // Test 7: User cannot read another user's cart
    {
      name: 'user-cannot-read-other-users-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const otherUid = accounts.admin.uid;
        const db = rules.asAccount('basic');
        const adminDb = rules.asAccount('admin');

        // Create cart for admin user
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${otherUid}`).set({
            id: otherUid,
            owner: otherUid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // Basic user cannot read admin's cart
        await rules.expectFailure(
          db.doc(`payments-carts/${otherUid}`).get()
        );
      },
    },

    // Test 8: Anonymous cannot create a cart
    {
      name: 'anonymous-cannot-create-cart',
      auth: 'none',

      async run({ rules }) {
        const db = rules.asAnonymous();

        await rules.expectFailure(
          db.doc(`payments-carts/anonymous-user`).set({
            id: 'anonymous-user',
            owner: 'anonymous-user',
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );
      },
    },

    // Test 9: Anonymous cannot read a cart
    {
      name: 'anonymous-cannot-read-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const adminDb = rules.asAccount('admin');
        const db = rules.asAnonymous();

        // Create cart as admin
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // Anonymous cannot read
        await rules.expectFailure(
          db.doc(`payments-carts/${uid}`).get()
        );
      },
    },

    // Test 10: User cannot delete their own cart
    {
      name: 'user-cannot-delete-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const db = rules.asAccount('basic');
        const adminDb = rules.asAccount('admin');

        // Create cart as admin
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // User cannot delete (no delete rule)
        await rules.expectFailure(
          db.doc(`payments-carts/${uid}`).delete()
        );
      },
    },

    // Test 11: Admin can read any cart
    {
      name: 'admin-can-read-any-cart',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const adminDb = rules.asAccount('admin');

        // Create cart for basic user
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // Admin can read it
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).get()
        );
      },
    },

    // Test 12: Admin can set status to completed (server-side completion)
    {
      name: 'admin-can-set-status-completed',
      auth: 'none',

      async run({ rules, accounts }) {
        const uid = accounts.basic.uid;
        const adminDb = rules.asAccount('admin');

        // Create cart
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).set({
            id: uid,
            owner: uid,
            status: 'pending',
            productId: 'premium',
            type: 'subscription',
          })
        );

        // Admin can update to completed
        await rules.expectSuccess(
          adminDb.doc(`payments-carts/${uid}`).update({
            status: 'completed',
          })
        );
      },
    },
  ],
};
