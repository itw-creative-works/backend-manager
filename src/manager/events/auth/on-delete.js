const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * onDelete - Delete user doc
 *
 * This function fires when a user is deleted from Firebase Auth.
 * It deletes the user doc from Firestore.
 *
 * Key behaviors:
 * - Checks if user doc exists before attempting delete
 * - Retries up to 3 times with exponential backoff on failure
 * - Logs timing for performance monitoring
 */
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  const startTime = Date.now();
  const { admin } = libraries;

  assistant.log(`onDelete: ${user.uid}`, { email: user.email });

  // Check if user doc exists before attempting delete
  const existingDoc = await admin.firestore().doc(`users/${user.uid}`)
    .get()
    .catch(e => {
      assistant.error(`onDelete: Failed to check existing doc for ${user.uid}:`, e);
      return null;
    });

  if (!existingDoc || !existingDoc.exists) {
    assistant.log(`onDelete: User doc does not exist for ${user.uid}, skipping (${Date.now() - startTime}ms)`);
    return;
  }

  // Delete user doc with retry
  try {
    await retryWrite(assistant, async () => {
      await admin.firestore().doc(`users/${user.uid}`).delete();
    }, MAX_RETRIES, RETRY_DELAY_MS);

    assistant.log(`onDelete: Successfully deleted user doc for ${user.uid}`);
  } catch (error) {
    assistant.error(`onDelete: Failed to delete user doc after ${MAX_RETRIES} retries:`, error);

    // Don't reject - the user was already deleted from Auth
    // Just log the error and continue
    return;
  }

  // Remove marketing contact from all providers (non-blocking)
  if (user.email) {
    const email = Manager.Email(assistant);
    email.remove(user.email)
      .then((r) => assistant.log('onDelete: Marketing remove:', r))
      .catch((e) => assistant.error('onDelete: Marketing remove failed:', e));
  }

  // Send delete analytics (server-side only event)
  Manager.Analytics({
    assistant: assistant,
    uuid: user.uid,
  }).event('user_delete', {});

  assistant.log(`onDelete: Completed for ${user.uid} (${Date.now() - startTime}ms)`);
};

/**
 * Retry a function up to maxRetries times with exponential backoff
 */
async function retryWrite(assistant, fn, maxRetries, delayMs) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error;
      assistant.error(`onDelete: Write attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        assistant.log(`onDelete: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}
