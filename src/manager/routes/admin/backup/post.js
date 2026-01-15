/**
 * POST /admin/backup - Backup Firestore
 * Admin-only endpoint to export Firestore to Cloud Storage
 */
const moment = require('moment');
const powertools = require('node-powertools');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

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

  // Parse deletion regex if provided
  settings.deletionRegex = settings.deletionRegex
    ? powertools.regexify(settings.deletionRegex)
    : settings.deletionRegex;

  // Setup Firestore Admin Client
  const client = new admin.firestore.v1.FirestoreAdminClient({});
  const projectId = Manager.project.projectId;
  const resourceZone = Manager.project.resourceZone;
  const databaseName = client.databasePath(projectId, '(default)');
  const bucketName = `bm-backup-firestore-${projectId}`;
  const bucketAddress = `gs://${bucketName}`;

  // Ensure bucket exists
  await createBucket(assistant, bucketName, resourceZone);

  // Export documents
  const result = await client.exportDocuments({
    name: databaseName,
    outputUriPrefix: bucketAddress,
    collectionIds: [],
  }).catch(async (e) => {
    await setMetaStats(assistant, admin, e);
    return e;
  });

  if (result instanceof Error) {
    return assistant.respond(result.message, { code: 500 });
  }

  const response = result[0];

  assistant.log('Saved backup successfully:', response.metadata.outputUriPrefix);

  await setMetaStats(assistant, admin, null);

  // Track analytics
  assistant.analytics.event('admin/backup', { status: 'success' });

  return assistant.respond({ name: response['name'] });
};

// Helper: Set meta stats
async function setMetaStats(assistant, admin, error) {
  const isError = error instanceof Error;

  await admin.firestore().doc('meta/stats')
    .set({
      backups: {
        lastBackup: {
          date: {
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
          },
          status: {
            success: !isError,
            error: isError ? error.message : null,
          }
        }
      },
      metadata: assistant.Manager.Metadata().set({ tag: 'admin/backup' }),
    }, { merge: true })
    .catch(e => {
      assistant.error('Failed to update meta stats', e);
    });
}

// Helper: Create bucket if it doesn't exist
async function createBucket(assistant, bucketName, resourceZone) {
  try {
    const meta = await storage.bucket(bucketName).getMetadata();
    assistant.log(`${bucketName} metadata`, meta[0]);
  } catch (e) {
    // Bucket doesn't exist, create it
    const result = await storage.createBucket(bucketName, {
      location: resourceZone,
      storageClass: 'COLDLINE',
    }).catch(err => err);

    assistant.log('storageCreation', result);
  }
}
