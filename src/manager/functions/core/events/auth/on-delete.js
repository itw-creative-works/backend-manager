const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.assistant = Manager.Assistant();
  self.libraries = Manager.libraries;
  self.user = payload.user;
  self.context = payload.context;

  return self;
};

/**
 * onDelete - Delete user doc + decrement count
 *
 * This function fires when a user is deleted from Firebase Auth.
 * It deletes the user doc and decrements the user count in an atomic batch write.
 *
 * Key behaviors:
 * - Checks if user doc exists before attempting delete
 * - Batch deletes user doc + decrements count atomically
 * - Logs timing for performance monitoring
 */
Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;

  return new Promise(async function(resolve, reject) {
    const startTime = Date.now();
    const { admin } = self.libraries;

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
      return resolve(self);
    }

    // Batch write with retry: delete user doc + decrement count atomically
    try {
      await self.retryBatchWrite(async () => {
        const batch = admin.firestore().batch();

        // Delete user doc
        batch.delete(admin.firestore().doc(`users/${user.uid}`));

        // Decrement user count
        batch.update(admin.firestore().doc('meta/stats'), {
          'users.total': admin.firestore.FieldValue.increment(-1),
        });

        await batch.commit();
      }, MAX_RETRIES, RETRY_DELAY_MS);

      assistant.log(`onDelete: Successfully deleted user doc for ${user.uid}`);
    } catch (error) {
      assistant.error(`onDelete: Failed to delete user doc after ${MAX_RETRIES} retries:`, error);

      // Don't reject - the user was already deleted from Auth
      // Just log the error and continue
      return resolve(self);
    }

    // Send delete analytics (server-side only event)
    self.sendAnalytics();

    assistant.log(`onDelete: Completed for ${user.uid} (${Date.now() - startTime}ms)`);

    return resolve(self);
  });
};

/**
 * Retry a function up to maxRetries times with exponential backoff
 */
Module.prototype.retryBatchWrite = async function (fn, maxRetries, delayMs) {
  const self = this;
  const assistant = self.assistant;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error;
      assistant.error(`onDelete: Batch write attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        assistant.log(`onDelete: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
};

/**
 * Send analytics event for user deletion
 */
Module.prototype.sendAnalytics = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;

  Manager.Analytics({
    assistant: assistant,
    uuid: user.uid,
  }).event({
    name: 'user_delete',
    params: {},
  });
};

module.exports = Module;
