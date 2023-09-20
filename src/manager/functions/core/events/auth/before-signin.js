const { get } = require('lodash');

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();
  self.user = payload.user
  self.context = payload.context

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {

    assistant.log(`Request: ${user.uid}`, user, context, {environment: 'production'});

    const now = new Date();

    // Save IP to Firestore after successful IP check
    const update = await admin.firestore().doc(`users/${user.uid}`)
      .set({
        activity: {
          lastActivity: {
            timestamp: now.toISOString(),
            timestampUNIX: Math.round(now.getTime() / 1000),
          },
          geolocation: {
            ip: context.ipAddress,
            language: context.locale,
          },
          client: {
            userAgent: context.userAgent,
          },
        },
      }, { merge: true });

    if (update instanceof Error) {
      assistant.error(`Failed to update user ${user.uid}:`, update, { environment: 'production' });

      throw new functions.auth.HttpsError('internal');
    }

    assistant.log(`Updated user activity`, {environment: 'production'});

    return resolve(self);
  });
};

module.exports = Module;
