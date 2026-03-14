const { FieldValue } = require('firebase-admin/firestore');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * onCreate - Create user doc + increment count
 *
 * This function fires for ALL user creations (including Admin SDK).
 * It creates the user doc and increments the user count in an atomic batch write.
 *
 * Key behaviors:
 * - Checks if user doc already exists (auth.uid) → skips if exists (handles test accounts, provider linking)
 * - Batch writes user doc + increment count atomically
 * - Retries up to 3 times with exponential backoff on failure
 *
 * Non-critical work (name inference, welcome emails, marketing contact) is handled
 * by the user/signup endpoint, which the frontend calls after account creation.
 */
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  const startTime = Date.now();
  const { admin } = libraries;

  assistant.log(`onCreate: ${user.uid}`, { email: user.email });

  // Skip anonymous users
  if (user.providerData?.every(p => p.providerId === 'anonymous')) {
    assistant.log(`onCreate: Skipping anonymous user ${user.uid} (${Date.now() - startTime}ms)`);
    return;
  }

  // Check if user doc already exists (handles test accounts, provider linking)
  const existingDoc = await admin.firestore().doc(`users/${user.uid}`)
    .get()
    .catch(e => {
      assistant.error(`onCreate: Failed to check existing doc for ${user.uid}:`, e);
      return null;
    });

  if (existingDoc?.exists && existingDoc.data()?.auth?.uid) {
    assistant.log(`onCreate: User doc already exists for ${user.uid}, skipping creation (${Date.now() - startTime}ms)`);
    return;
  }

  // Create user record using Manager.User() helper
  const userRecord = Manager.User({
    auth: {
      uid: user.uid,
      email: user.email,
    },
  }).properties;

  // Add metadata tag (merge into existing metadata to preserve metadata.created from User schema)
  const meta = Manager.Metadata().set({ tag: 'auth:on-create' });
  userRecord.metadata = { ...userRecord.metadata, ...meta };

  assistant.log(`onCreate: Creating user doc for ${user.uid}`, userRecord);

  // Batch write with retry: create user doc + increment count
  try {
    await retryBatchWrite(assistant, async () => {
      const batch = admin.firestore().batch();

      // Create user doc
      batch.set(admin.firestore().doc(`users/${user.uid}`), userRecord);

      // Increment user count (use set+merge so doc is created if missing)
      batch.set(admin.firestore().doc('meta/stats'), {
        users: { total: FieldValue.increment(1) },
      }, { merge: true });

      await batch.commit();
    }, MAX_RETRIES, RETRY_DELAY_MS);

    assistant.log(`onCreate: Successfully created user doc for ${user.uid} (${Date.now() - startTime}ms)`);
  } catch (error) {
    assistant.error(`onCreate: Failed to create user doc after ${MAX_RETRIES} retries:`, error);

    // Don't reject - the user was already created in Auth
    // The user/signup endpoint will handle creating the doc if it's missing
  }
};

/**
 * Retry a function up to maxRetries times with exponential backoff
 */
async function retryBatchWrite(assistant, fn, maxRetries, delayMs) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error;
      assistant.error(`onCreate: Batch write attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        assistant.log(`onCreate: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}
