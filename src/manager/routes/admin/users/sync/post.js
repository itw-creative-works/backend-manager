/**
 * POST /admin/users/sync - Sync Firebase Auth users to Firestore
 * Admin-only endpoint to synchronize user records
 */
const { merge } = require('lodash');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Require authentication (allow in dev)
  if (!user.authenticated && assistant.isProduction()) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin (allow in dev)
  if (!user.roles.admin && assistant.isProduction()) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Get lastPageToken from meta/stats
  const metaDoc = await admin.firestore().doc('meta/stats').get().catch(e => e);

  if (metaDoc instanceof Error) {
    return assistant.respond(metaDoc.message, { code: 500 });
  }

  const metaData = metaDoc.data() || {};
  const lastPageToken = metaData?.syncUsers?.lastPageToken;
  let processedUsers = 0;

  assistant.log(`Running sync-users based on lastPageToken: ${lastPageToken}`);

  // List firebase auth users
  await Manager.Utilities().iterateUsers(
    async (batch, index) => {
      // Process user function
      async function processUser(authUser, i) {
        const account = authUser.toJSON();
        const uid = account.uid;
        const email = account.email;
        const created = new Date(account.metadata.creationTime);
        const activity = new Date(account.metadata.lastSignInTime);
        const isAnonymous = account.providerData.length === 0;

        // Skip anonymous users
        if (isAnonymous) {
          return;
        }

        // Get existing user data
        const userDoc = await admin.firestore().doc(`users/${uid}`).get().catch(() => null);
        const userData = userDoc?.data() || {};

        // Build new user object
        const newUser = Manager.User({
          auth: {
            uid: uid,
            email: email,
          },
          activity: {
            created: {
              timestamp: created.toISOString(),
              timestampUNIX: Math.floor(created.getTime() / 1000),
            },
            lastActivity: {
              timestamp: activity.toISOString(),
              timestampUNIX: Math.floor(activity.getTime() / 1000),
            },
          }
        });

        const finalData = merge(newUser.properties, userData);

        // Set metadata
        finalData.metadata = Manager.Metadata().set({ tag: 'admin/users/sync' });

        // Save to database
        await admin.firestore().doc(`users/${uid}`)
          .set(finalData, { merge: true })
          .then(() => {
            assistant.log(`Synched user: ${uid}`);
            processedUsers++;
          })
          .catch(e => {
            assistant.error(`Failed to sync user: ${uid}`, e);
          });
      }

      // Process each user in batch
      for (let i = 0; i < batch.users.length; i++) {
        await processUser(batch.users[i], i);
      }

      // Save pageToken for resume
      if (batch.pageToken) {
        await admin.firestore().doc('meta/stats')
          .update({
            syncUsers: {
              lastPageToken: batch.pageToken,
            }
          })
          .then(() => {
            assistant.log(`Saved lastPageToken: ${batch.pageToken}`);
          })
          .catch(e => {
            assistant.error('Failed to update lastPageToken', e);
          });
      }
    },
    { batchSize: 10, log: true, pageToken: lastPageToken }
  );

  assistant.log(`Processed ${processedUsers} users.`);

  // Track analytics
  assistant.analytics.event('admin/users/sync', { processed: processedUsers });

  return assistant.respond({ processed: processedUsers });
};
