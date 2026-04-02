/**
 * beforeUserSignedIn - Update activity + send sign-in analytics
 *
 * This function fires on every sign-in (including right after account creation).
 * It updates last activity and sends sign-in analytics.
 *
 * TODO: Add mailer.sync(uid) here with 1x/day rate limit to keep marketing
 * contact data (name, country, subscription fields) fresh between sessions.
 *
 * Available parameters (1st gen):
 *
 * user (AuthUserRecord):
 *   uid, email, emailVerified, displayName, photoURL, phoneNumber, disabled,
 *   metadata: { creationTime, lastSignInTime },
 *   providerData: [{ uid, displayName, email, photoURL, providerId, phoneNumber }],
 *   passwordHash, passwordSalt, customClaims, tenantId, tokensValidAfterTime, multiFactor
 *
 * context (AuthEventContext):
 *   ipAddress, userAgent, locale, eventId, eventType, authType, resource, timestamp,
 *   additionalUserInfo: { providerId, profile, username, isNewUser, recaptchaScore, email, phoneNumber },
 *   credential: { providerId, signInMethod, claims, idToken, accessToken, refreshToken, expirationTime, secret } | null,
 *   emailType, smsType, params
 *
 * Note: recaptchaScore requires reCAPTCHA Enterprise (Google Cloud level), NOT the Firebase SMS fraud toggle.
 * Note: credential tokens (idToken, accessToken, refreshToken) require opt-in via BlockingOptions.
 */
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  const startTime = Date.now();
  const { admin } = libraries;

  assistant.log(`beforeSignIn: ${user.uid} (${user.email})`, user, context);

  const now = new Date();

  // Update last activity and geolocation
  const update = await admin.firestore().doc(`users/${user.uid}`)
    .set({
      metadata: {
        updated: {
          timestamp: now.toISOString(),
          timestampUNIX: Math.round(now.getTime() / 1000),
        },
      },
      activity: {
        geolocation: {
          ip: context.ipAddress,
          language: context.locale,
        },
        client: {
          userAgent: context.userAgent,
        },
      },
    }, { merge: true })
    .catch(e => e);

  if (update instanceof Error) {
    assistant.error(`beforeSignIn: Failed to update user ${user.uid}:`, update);
    // Don't block sign-in for activity update failure
  } else {
    assistant.log(`beforeSignIn: Updated user activity`);
  }

  assistant.log(`beforeSignIn: Completed for ${user.uid} (${Date.now() - startTime}ms)`);
};
