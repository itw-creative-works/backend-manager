const { get } = require('lodash');

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.assistant = Manager.Assistant();
  self.libraries = Manager.libraries;
  self.user = payload.user
  self.context = payload.context

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

    assistant.log(`Request: ${user.uid}`, user, context);

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
      assistant.error(`Failed to update user ${user.uid}:`, update);

      throw new functions.auth.HttpsError('internal', `Failed to update user: ${update}`);
    }

    assistant.log(`Updated user activity`);

    return resolve(self);
  });
};

module.exports = Module;
