const { get, merge } = require('lodash');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();
  self.user = payload.user;
  self.context = payload.context;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const functions = self.libraries.functions;
    const admin = self.libraries.admin;

    assistant.log(`Request: ${user.uid}`, user, context, { environment: 'production' });

    const ipAddress = context.ipAddress;
    const currentTime = Date.now();
    const oneHour = 60 * 60 * 1000; // One hour in milliseconds

    // Get current rate-limiting data
    const rateLimitingData = await self.Manager.storage({ name: 'rate-limiting' }).get(`ipRateLimits.${ipAddress}`);
    const count = get(rateLimitingData, 'count', 0);
    const lastTime = get(rateLimitingData, 'lastTime', 0);

    assistant.log(`Rate limiting for ${ipAddress}:`, rateLimitingData, { environment: 'production' });

    if (currentTime - lastTime < oneHour && count >= 2) {
      assistant.error(`Too many attemps to create an account for ${ipAddress}`, { environment: 'production' });

      throw new functions.auth.HttpsError('resource-exhausted');
    }

    // Update rate-limiting data
    await self.Manager.storage({ name: 'rate-limiting' }).set(`ipRateLimits.${ipAddress}`, { count: count + 1, lastTime: currentTime });

    const existingAccount = await admin.firestore().doc(`users/${user.uid}`)
      .get()
      .then((doc) => doc.data())
      .catch(e => e);

    // If user already exists, skip auth-on-create handler
    if (existingAccount instanceof Error) {
      assistant.error(`Failed to get existing account ${user.uid}:`, existingAccount, { environment: 'production' });

      throw new functions.auth.HttpsError('internal');
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
          userAgent: context.userAgent,
        },
      },
    };

    // If it exists, just add the activity data
    if (!get(existingAccount, 'auth.uid', null) || !get(existingAccount, 'auth.email', null)) {
      account = merge(
        self.Manager.User({
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
      assistant.error(`Failed to update user ${user.uid}:`, update, { environment: 'production' });

      throw new functions.auth.HttpsError('internal');
    }

    assistant.log(`User created at users/${user.uid}`, account, { environment: 'production' });

    return resolve(self);
  });
};

module.exports = Module;
