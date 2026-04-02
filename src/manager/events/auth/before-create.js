const { isDisposable } = require('../../libraries/email/validation.js');

const ERROR_TOO_MANY_ATTEMPTS = 'Unable to create account at this time. Please try again later.';
const ERROR_DISPOSABLE_EMAIL = 'This email domain is not allowed. Please use a different email address.';
const MAX_SIGNUPS_PER_DAY = 2;

/**
 * beforeUserCreated - Disposable email blocking + IP rate limiting
 *
 * User doc creation is handled by on-create.js (which fires for all user creations including Admin SDK).
 *
 * Why not create user doc here?
 * - Admin SDK (used for tests) does NOT trigger beforeUserCreated
 * - on-create fires for ALL user creations, making it more reliable
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
  const { functions } = libraries;
  const ipAddress = context.ipAddress || '';

  assistant.log(`beforeCreate: ${user.uid} (${user.email})`, user, context);

  // Block disposable email domains
  if (isDisposable(user.email)) {
    assistant.error(`beforeCreate: Blocked disposable email ${user.email}`);

    throw new functions.auth.HttpsError('invalid-argument', ERROR_DISPOSABLE_EMAIL);
  }

  // Skip rate limiting if no IP (shouldn't happen in production)
  if (!ipAddress) {
    assistant.log(`beforeCreate: No IP address, skipping rate limit check (${Date.now() - startTime}ms)`);
    return;
  }

  // IP Rate Limiting using Usage system
  const usage = await Manager.Usage().init(assistant, {
    key: ipAddress,
    log: true,
  });

  const signups = usage.getUsage('signups');

  assistant.log(`beforeCreate: Rate limit check for ${ipAddress}: ${signups}/${MAX_SIGNUPS_PER_DAY}`);

  // Block if too many signups from this IP
  if (signups >= MAX_SIGNUPS_PER_DAY) {
    assistant.error(`beforeCreate: Too many signups from ${ipAddress} (${signups}/${MAX_SIGNUPS_PER_DAY})`);

    throw new functions.auth.HttpsError('resource-exhausted', ERROR_TOO_MANY_ATTEMPTS);
  }

  // Increment rate limit counter
  usage.increment('signups');
  await usage.update();

  assistant.log(`beforeCreate: Completed for ${user.uid} (${Date.now() - startTime}ms)`);
};
