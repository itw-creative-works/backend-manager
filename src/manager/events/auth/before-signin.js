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
 * beforeUserSignedIn - Update activity + send sign-in analytics
 *
 * This function fires on every sign-in (including right after account creation).
 * It updates last activity and sends sign-in analytics.
 */
Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const startTime = Date.now();
    const { admin } = self.libraries;

    assistant.log(`beforeSignIn: ${user.uid}`, { email: user.email, ip: context.ipAddress });

    const now = new Date();

    // Update last activity and geolocation
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
      }, { merge: true })
      .catch(e => e);

    if (update instanceof Error) {
      assistant.error(`beforeSignIn: Failed to update user ${user.uid}:`, update);
      // Don't block sign-in for activity update failure
    } else {
      assistant.log(`beforeSignIn: Updated user activity`);
    }

    assistant.log(`beforeSignIn: Completed for ${user.uid} (${Date.now() - startTime}ms)`);

    return resolve(self);
  });
};

module.exports = Module;
