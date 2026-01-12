const MAX_POLL_TIME_MS = 30000;
const POLL_INTERVAL_MS = 500;
const MAX_ACCOUNT_AGE_MS = 5 * 60 * 1000; // 5 minutes

function Module() {

}

/**
 * user:sign-up - Called by client after account creation
 *
 * This function:
 * 1. Polls for user doc to exist (waits for onCreate to complete)
 * 2. Checks if user has already signed up (prevents duplicate calls)
 * 3. Updates user with client details (geolocation, browser info)
 * 4. Processes affiliate code and updates referrer
 * 5. Sends welcome emails
 */
Module.prototype.main = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;
    const payload = self.payload;

    const { admin } = Manager.libraries;

    Api.resolveUser({ adminRequired: true })
    .then(async (user) => {
      const requestData = payload.data.payload;

      assistant.log(`signUp(): Starting for ${user.auth.uid}`, requestData);

      // 1. Poll for user doc to exist (wait for onCreate to complete)
      const userDoc = await self.pollForUserDoc(user.auth.uid, MAX_POLL_TIME_MS, POLL_INTERVAL_MS);

      if (!userDoc) {
        return reject(assistant.errorify('User document not found after waiting. Please try again.', { code: 500 }));
      }

      assistant.log(`signUp(): User doc found for ${user.auth.uid}`);

      // 2. Check if signup has already been processed (prevent duplicate calls)
      // Use flags.signupProcessed since flags is system-controlled and not user-editable
      if (userDoc.flags?.signupProcessed) {
        return reject(assistant.errorify('Signup has already been processed', { code: 400 }));
      }

      // 3. Backup check: reject if account is older than 5 minutes
      // This prevents exploitation even if flags.signupProcessed is somehow bypassed and for legacy accounts without the flag
      // Uses Firebase Auth metadata.creationTime which is authoritative and cannot be manipulated
      // TODO: Remove this once all accounts are upgraded to use flags.signupProcessed
      const authUser = await admin.auth().getUser(user.auth.uid).catch(e => e);
      if (authUser instanceof Error) {
        return reject(assistant.errorify(`Failed to get auth user: ${authUser.message}`, { code: 500 }));
      }
      const accountAgeMs = Date.now() - new Date(authUser.metadata.creationTime).getTime();
      if (accountAgeMs > MAX_ACCOUNT_AGE_MS) {
        return reject(assistant.errorify('Account is too old to process signup', { code: 400 }));
      }

      // 4. Normalize data - support both legacy and new formats
      // Legacy: { affiliateCode: 'CODE' }
      // New: { attribution: { affiliate: {...}, utm: {...} }, context: {...} }
      const attribution = requestData.attribution || {};

      // Legacy support: if affiliateCode exists, normalize to new format
      if (requestData.affiliateCode && !attribution.affiliate?.code) {
        attribution.affiliate = { code: requestData.affiliateCode };
      }

      // Get affiliate code for referral tracking
      const affiliateCode = attribution.affiliate?.code || null;

      // 5. Build update record with client details
      const userRecord = {
        flags: {
          signupProcessed: true,
        },
        activity: {
          ...(requestData.context || {}),
          geolocation: {
            ...(requestData.context?.geolocation || {}),
            ...assistant.request.geolocation,
          },
          client: {
            ...(requestData.context?.client || {}),
            ...assistant.request.client,
          },
        },
        attribution: attribution || {},
        metadata: Manager.Metadata().set({ tag: 'user:sign-up' }),
      };

      // Log the user record
      assistant.log(`signUp(): Updating user record for ${user.auth.uid}`, userRecord);

      // Update user doc with client details
      await admin.firestore().doc(`users/${user.auth.uid}`)
        .set(userRecord, { merge: true })
        .catch(e => {
          assistant.error(`signUp(): Failed to update user record:`, e);
        });

      // 6. Update referrer if affiliate code provided
      if (affiliateCode) {
        await self.updateReferral(user.auth.uid, affiliateCode)
          .catch(e => {
            assistant.error(`signUp(): Failed to update referral:`, e);
          });
      }

      // Note: SendGrid list and welcome emails are now handled by auth:on-create

      return resolve({
        data: {
          signedUp: true,
        },
      });
    })
    .catch((e) => {
      return reject(e);
    });
  });
};

/**
 * Poll for user doc to exist (wait for onCreate to complete)
 */
Module.prototype.pollForUserDoc = async function (uid, maxTimeMs, intervalMs) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const { admin } = Manager.libraries;

  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeMs) {
    const doc = await admin.firestore().doc(`users/${uid}`)
      .get()
      .catch(e => {
        assistant.error(`pollForUserDoc(): Error fetching doc:`, e);
        return null;
      });

    if (doc && doc.exists && doc.data()?.auth?.uid) {
      return doc.data();
    }

    assistant.log(`pollForUserDoc(): Waiting for user doc ${uid}...`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  assistant.error(`pollForUserDoc(): Timeout waiting for user doc ${uid}`);
  return null;
};

/**
 * Update referrer's referrals array when a new user signs up with an affiliate code
 */
Module.prototype.updateReferral = function (newUserUid, affiliateCode) {
  const self = this;

  return new Promise(function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const { admin } = Manager.libraries;

    if (!affiliateCode) {
      return resolve();
    }

    assistant.log(`updateReferral(): Looking for referrer with code ${affiliateCode}`);

    // Find the user with this affiliate code
    admin.firestore().collection('users')
      .where('affiliate.code', '==', affiliateCode)
      .get()
      .then(async (snapshot) => {
        if (snapshot.empty) {
          assistant.log(`updateReferral(): No referrer found with code ${affiliateCode}`);
          return resolve();
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
          .catch(e => {
            assistant.error(`updateReferral(): Failed to update referrer:`, e);
          });

        return resolve();
      })
      .catch(e => {
        assistant.error(`updateReferral(): Failed to find referrer:`, e);
        return reject(e);
      });
  });
};

module.exports = Module;
