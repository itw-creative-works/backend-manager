const MAX_POLL_TIME_MS = 30000;
const POLL_INTERVAL_MS = 500;
const MAX_ACCOUNT_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /user/signup - Complete user signup
 *
 * Called by client after account creation to:
 * 1. Poll for user doc to exist (waits for onCreate to complete)
 * 2. Check if user has already signed up (prevents duplicate calls)
 * 3. Update user with client details (geolocation, browser info)
 * 4. Process affiliate code and update referrer
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID (default to self)
  const uid = settings.uid || user.auth.uid;

  // Require admin to signup other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  assistant.log(`signup(): Starting for ${uid}`, settings);

  // 1. Poll for user doc to exist (wait for onCreate to complete)
  const userDoc = await pollForUserDoc(admin, assistant, uid);

  if (!userDoc) {
    return assistant.respond('User document not found after waiting. Please try again.', { code: 500 });
  }

  assistant.log(`signup(): User doc found for ${uid}`);

  // 2. Check if signup has already been processed
  if (userDoc.flags?.signupProcessed) {
    return assistant.respond('Signup has already been processed', { code: 400 });
  }

  // 3. Backup check: reject if account is older than 5 minutes
  const authUser = await admin.auth().getUser(uid).catch((e) => e);

  if (authUser instanceof Error) {
    return assistant.respond(`Failed to get auth user: ${authUser.message}`, { code: 500 });
  }

  const accountAgeMs = Date.now() - new Date(authUser.metadata.creationTime).getTime();

  if (accountAgeMs > MAX_ACCOUNT_AGE_MS) {
    return assistant.respond('Account is too old to process signup', { code: 400 });
  }

  // 4. Normalize data - support both legacy and new formats
  const attribution = settings.attribution || {};

  // Legacy support: if affiliateCode exists, normalize to new format
  if (settings.affiliateCode && !attribution.affiliate?.code) {
    attribution.affiliate = { code: settings.affiliateCode };
  }

  const affiliateCode = attribution.affiliate?.code || null;

  // 5. Build update record with client details
  const userRecord = {
    flags: {
      signupProcessed: true,
    },
    activity: {
      ...(settings.context || {}),
      geolocation: {
        ...(settings.context?.geolocation || {}),
        ...assistant.request.geolocation,
      },
      client: {
        ...(settings.context?.client || {}),
        ...assistant.request.client,
      },
    },
    attribution: attribution || {},
    metadata: Manager.Metadata().set({ tag: 'user/signup' }),
  };

  assistant.log(`signup(): Updating user record for ${uid}`, userRecord);

  // Update user doc with client details
  await admin.firestore().doc(`users/${uid}`)
    .set(userRecord, { merge: true })
    .catch((e) => {
      assistant.error(`signup(): Failed to update user record:`, e);
    });

  // 6. Update referrer if affiliate code provided
  if (affiliateCode) {
    await updateReferral(admin, assistant, uid, affiliateCode)
      .catch((e) => {
        assistant.error(`signup(): Failed to update referral:`, e);
      });
  }

  return assistant.respond({ signedUp: true });
};

/**
 * Poll for user doc to exist (wait for onCreate to complete)
 */
async function pollForUserDoc(admin, assistant, uid) {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const doc = await admin.firestore().doc(`users/${uid}`)
      .get()
      .catch((e) => {
        assistant.error(`pollForUserDoc(): Error fetching doc:`, e);
        return null;
      });

    if (doc && doc.exists && doc.data()?.auth?.uid) {
      return doc.data();
    }

    assistant.log(`pollForUserDoc(): Waiting for user doc ${uid}...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  assistant.error(`pollForUserDoc(): Timeout waiting for user doc ${uid}`);
  return null;
}

/**
 * Update referrer's referrals array when a new user signs up with an affiliate code
 */
async function updateReferral(admin, assistant, newUserUid, affiliateCode) {
  if (!affiliateCode) {
    return;
  }

  assistant.log(`updateReferral(): Looking for referrer with code ${affiliateCode}`);

  const snapshot = await admin.firestore().collection('users')
    .where('affiliate.code', '==', affiliateCode)
    .get()
    .catch((e) => {
      assistant.error(`updateReferral(): Failed to find referrer:`, e);
      throw e;
    });

  if (snapshot.empty) {
    assistant.log(`updateReferral(): No referrer found with code ${affiliateCode}`);
    return;
  }

  // Update the first matching referrer
  const referrerDoc = snapshot.docs[0];
  const referrerData = referrerDoc.data() || {};

  let referrals = referrerData?.affiliate?.referrals || [];
  referrals = Array.isArray(referrals) ? referrals : [];

  // Add new referral
  referrals.push({
    uid: newUserUid,
    timestamp: assistant.meta.startTime.timestamp,
  });

  assistant.log(`updateReferral(): Appending referral to ${referrerDoc.id}`, referrals);

  await admin.firestore().doc(`users/${referrerDoc.id}`)
    .set({
      affiliate: {
        referrals: referrals,
      },
    }, { merge: true })
    .then(() => {
      assistant.log(`updateReferral(): Success`);
    })
    .catch((e) => {
      assistant.error(`updateReferral(): Failed to update referrer:`, e);
    });
}
