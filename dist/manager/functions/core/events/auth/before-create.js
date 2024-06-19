const { get, merge } = require('lodash');

const ERROR_TOO_MANY_ATTEMPTS = 'You have created too many accounts with our service. Please try again later.';

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

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const { admin, functions } = self.libraries;
    const storage = Manager.storage({ temporary: true, name: 'rate-limiting' });

    assistant.log(`Request: ${user.uid}`, user, context);

    // TODO: ⛔️⛔️⛔️ UTILIZE THE NEW .usage() system (similar to src/manager/functions/core/actions/api/user/sign-up.js)

    // if (context.additionalUserInfo.recaptchaScore < 0.5) {
    //   assistant.error(`Recaptcha score (${context.additionalUserInfo.recaptchaScore}) too low for ${user.uid}`);

    //   throw new functions.auth.HttpsError('resource-exhausted', ERROR_TOO_MANY_ATTEMPTS);
    // }

    const ipAddress = context.ipAddress;
    const currentTime = Date.now();
    const oneHour = 60 * 60 * 1000; // One hour in milliseconds

    // Get current rate-limiting data
    const rateLimitingData = storage.get(`ipRateLimits.${ipAddress}`).value();
    const count = get(rateLimitingData, 'count', 0);
    const lastTime = get(rateLimitingData, 'lastTime', 0);

    assistant.log(`Rate limiting for ${ipAddress}:`, rateLimitingData);

    if (currentTime - lastTime < oneHour && count >= 2) {
      assistant.error(`Too many attemps to create an account for ${ipAddress}`);

      throw new functions.auth.HttpsError('resource-exhausted', ERROR_TOO_MANY_ATTEMPTS);
    }

    // Update rate-limiting data
   storage.set(`ipRateLimits.${ipAddress}`, { count: count + 1, lastTime: currentTime }).write();

    const existingAccount = await admin.firestore().doc(`users/${user.uid}`)
      .get()
      .then((doc) => doc.data())
      .catch(e => e);

    // If user already exists, skip auth-on-create handler
    if (existingAccount instanceof Error) {
      assistant.error(`Failed to get existing account ${user.uid}:`, existingAccount);

      throw new functions.auth.HttpsError('internal', `Failed to get existing account: ${existingAccount}`);
    }

    let account = {
      activity: {
        lastActivity: {
          timestamp: new Date(currentTime).toISOString(),
          timestampUNIX: Math.round(currentTime / 1000),
        },
        geolocation: {
          ip: ipAddress,
          language: context.locale,
        },
        client: {
          userAgent: context.userAgent,
        },
      },
    };

    // If it exists, just add the activity data
    if (!get(existingAccount, 'auth.uid', null) || !get(existingAccount, 'auth.email', null)) {
      account = merge(
        Manager.User({
          auth: {
            uid: user.uid,
            email: user.email,
          },
          activity: {
            created: {
              timestamp: new Date(currentTime).toISOString(),
              timestampUNIX: Math.round(currentTime / 1000),
            },
          },
        }).properties,
        account,
      );
    }

    // Save IP to Firestore after successful IP check
    const update = await admin.firestore().doc(`users/${user.uid}`)
      .set(account, { merge: true });

    if (update instanceof Error) {
      assistant.error(`Failed to update user ${user.uid}:`, update);

      throw new functions.auth.HttpsError('internal', `Failed to update user: ${update}`);
    }

    assistant.log(`User created at users/${user.uid}`, account);

    return resolve(self);
  });
};

module.exports = Module;
