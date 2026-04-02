const { retryWrite, runAuthHook, MAX_RETRIES } = require('./utils.js');

/**
 * onCreate - Create user doc
 *
 * This function fires for ALL user creations (including Admin SDK).
 * It creates the user doc in Firestore.
 *
 * Key behaviors:
 * - Checks if user doc already exists (auth.uid) → skips if exists (handles test accounts, provider linking)
 * - Retries up to 3 times with exponential backoff on failure
 *
 * If the user signed up via a provider (Google, Facebook, etc.), their display name
 * is extracted and stored as personal.name.first/last on the user doc.
 *
 * Non-critical work (welcome emails, marketing contact) is handled
 * by the user/signup endpoint, which the frontend calls after account creation.
 *
 * Available parameters (1st gen):
 *
 * user (UserRecord — firebase-admin):
 *   uid, email, emailVerified, displayName, photoURL, phoneNumber, disabled,
 *   metadata: { creationTime, lastSignInTime, lastRefreshTime },
 *   providerData: [{ uid, displayName, email, photoURL, providerId, phoneNumber }],
 *   passwordHash, passwordSalt, customClaims, tenantId, tokensValidAfterTime, multiFactor
 *
 * context (EventContext — NOT AuthEventContext, no ipAddress/userAgent/locale):
 *   eventId, eventType, timestamp, resource: { service, name }, params
 */
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  const startTime = Date.now();
  const { admin } = libraries;

  assistant.log(`onCreate: ${user.uid} (${user.email})`, user, context);

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

  // Extract name from provider data (e.g., Google, Facebook, GitHub)
  const providerName = extractProviderName(user);

  assistant.log(`onCreate: Inferred name from provider:`, providerName);

  // Create user record using Manager.User() helper
  const userRecord = Manager.User({
    auth: {
      uid: user.uid,
      email: user.email,
    },
    personal: providerName ? {
      name: providerName,
    } : undefined,
  }).properties;

  // Add metadata tag (merge into existing metadata to preserve metadata.created from User schema)
  const meta = Manager.Metadata().set({ tag: 'auth:on-create' });
  userRecord.metadata = { ...userRecord.metadata, ...meta };

  assistant.log(`onCreate: Creating user doc for ${user.uid}`, userRecord);

  // Write user doc with retry
  try {
    await retryWrite(assistant, 'onCreate', async () => {
      await admin.firestore().doc(`users/${user.uid}`).set(userRecord);
    });

    assistant.log(`onCreate: Successfully created user doc for ${user.uid} (${Date.now() - startTime}ms)`);
  } catch (error) {
    assistant.error(`onCreate: Failed to create user doc after ${MAX_RETRIES} retries:`, error);

    // Don't reject - the user was already created in Auth
    // The user/signup endpoint will handle creating the doc if it's missing
  }

  // Run consumer hook (non-blocking — errors logged but don't fail)
  await runAuthHook('on-create', { Manager, assistant, user, context, libraries }).catch(e => {
    assistant.error('onCreate: Consumer hook error:', e);
  });
};

/**
 * Extract first/last name from provider data (Google, Facebook, GitHub, etc.)
 * Returns { first, last } or null if no name found
 */
function extractProviderName(user) {
  // Try provider-specific displayName first, then top-level displayName
  const displayName = user.providerData?.find(p =>
    p.providerId !== 'password'
    && p.providerId !== 'anonymous'
    && p.displayName
  )?.displayName || user.displayName;

  if (!displayName) {
    return null;
  }

  const parts = displayName.trim().split(/\s+/);

  return {
    first: parts[0] || null,
    last: parts.slice(1).join(' ') || null,
  };
}
