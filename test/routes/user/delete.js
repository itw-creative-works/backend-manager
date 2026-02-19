/**
 * Test: DELETE /user
 * User deletion flow tests
 * Tests:
 * - Users with active subscriptions cannot delete themselves
 * - Users cannot delete other users
 * - Users can delete themselves after subscription is removed
 * - Admins can delete any user
 */
module.exports = {
  description: 'User deletion flow',
  type: 'suite',

  tests: [
    // --- Self-deletion tests ---
    {
      name: 'verify-delete-user-exists',
      async run({ firestore, assert, state, accounts }) {
        // Get the delete test account uid
        state.deleteUid = accounts.delete.uid;

        // Verify the user doc exists
        const userDoc = await firestore.get(`users/${state.deleteUid}`);

        assert.ok(userDoc, 'Delete user doc should exist before deletion');
        assert.ok(userDoc?.auth?.uid === state.deleteUid, 'User doc should have correct uid');
      },
    },

    {
      name: 'delete-blocked-with-subscription',
      async run({ http, assert }) {
        // Auth as the delete user and try to delete themselves
        // Should be blocked due to active subscription
        const deleteResponse = await http.as('delete').delete('user', {});

        assert.isError(deleteResponse, 400, 'Deletion should be blocked with active subscription');
        assert.ok(
          deleteResponse.error?.includes('paid subscription'),
          `Error should mention paid subscription: ${deleteResponse.error}`,
        );
      },
    },

    // NOTE: The DELETE /user API ignores the payload uid parameter for non-admin users.
    // It always uses the authenticated user's uid from resolveUser().
    // This means non-admins cannot delete other users by design - the uid param is simply ignored.
    // A test for "delete other user blocked" would be misleading since it would actually
    // try to delete the authenticated user (basic), not the target user.
    // If we want to explicitly block this, the API should be updated to check payload.uid
    // against user.auth.uid and return a 403 if they don't match.

    {
      name: 'remove-subscription-from-delete-user',
      async run({ firestore, state }) {
        // Remove the subscription (set to null to overwrite)
        await firestore.set(`users/${state.deleteUid}`, { subscription: null }, { merge: true });
      },
    },

    {
      name: 'delete-user-succeeds',
      async run({ http, assert }) {
        // Auth as the delete user and delete themselves
        const deleteResponse = await http.as('delete').delete('user', {});

        assert.isSuccess(deleteResponse, `DELETE /user should succeed: ${JSON.stringify(deleteResponse, null, 2)}`);
      },
    },

    {
      name: 'verify-firestore-doc-deleted',
      async run({ firestore, assert, state, waitFor }) {
        // on-delete handler deletes Firestore doc when Auth user is deleted
        // Wait for the deletion to complete
        const docDeleted = await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.deleteUid}`);
          return !userDoc;
        }, 10000, 500);

        assert.ok(docDeleted, 'Firestore doc should be deleted after Auth user deletion');
      },
    },

    // --- Admin deletion tests ---
    {
      name: 'verify-admin-delete-target-exists',
      async run({ firestore, assert, state, accounts }) {
        // Get the delete-by-admin test account uid
        state.adminDeleteUid = accounts['delete-by-admin'].uid;

        // Verify the user doc exists
        const userDoc = await firestore.get(`users/${state.adminDeleteUid}`);

        assert.ok(userDoc, 'Admin delete target user doc should exist');
        assert.ok(userDoc?.auth?.uid === state.adminDeleteUid, 'User doc should have correct uid');
      },
    },

    {
      name: 'admin-can-delete-other-user',
      async run({ http, assert, state }) {
        // Auth as admin (using backendManagerKey) and delete another user
        const deleteResponse = await http.as('admin').delete('user', {
          uid: state.adminDeleteUid,
        });

        assert.isSuccess(deleteResponse, `Admin should be able to delete another user: ${JSON.stringify(deleteResponse, null, 2)}`);
      },
    },

    {
      name: 'verify-admin-deleted-user-firestore-deleted',
      async run({ firestore, assert, state, waitFor }) {
        // on-delete handler deletes Firestore doc when Auth user is deleted
        // Wait for the deletion to complete
        const docDeleted = await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.adminDeleteUid}`);
          return !userDoc;
        }, 10000, 500);

        assert.ok(docDeleted, 'Firestore doc should be deleted after admin deletion');
      },
    },

    // --- Auth rejection test (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      async run({ http, assert }) {
        const deleteResponse = await http.as('none').delete('user', {});

        assert.isError(deleteResponse, 401, 'Delete should fail without authentication');
      },
    },
  ],
};
