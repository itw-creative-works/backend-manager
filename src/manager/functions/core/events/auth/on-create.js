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
    assistant.log(`Request: ${user.uid}`, user, context, { environment: 'production' });

    // Check if exists already
    // It could exist already if user signed up with email and then signed in with Google
    const existingUser = await libraries.admin.firestore().doc(`users/${user.uid}`)
      .get()
      .then((doc) => doc.data() || {})
      .catch(e => e)

    // If user already exists, skip auth-on-create handler
    if (existingUser instanceof Error) {
      assistant.error(`Failed to get existing user ${user.uid}:`, existingUser, { environment: 'production' });

      return reject(existingUser);
    } else if (
      get(existingUser, 'auth.uid', null)
      || get(existingUser, 'auth.email', null)
    ) {
      assistant.log(`Skipping handler because user already exists ${user.uid}:`, existingUser);

      return resolve(self);
    }

    // Build user object
    const newUser = self.Manager.User({
      auth: {
        uid: user.uid,
        email: user.email,
      }
    }).properties;

    // Set up analytics
    const analytics = self.Manager.Analytics({
      assistant: assistant,
      uuid: user.uid,
    })

    // Don't save if anonymous
    if (user.providerData.filter(function (item) {
      if (item.providerId !== 'anonymous') {
        analytics.event({
          category: 'engagement',
          action: 'signup',
          label: item.providerId,
        });
        return true
      }
    }).length < 1) {
      return resolve(self);
    }

    // Add metadata
    newUser.metadata = self.Manager.Metadata().set({tag: 'auth:on-create'});

    // Add user record
    await libraries.admin.firestore().doc(`users/${newUser.auth.uid}`)
      .set(newUser, {merge: true})
      .catch((e) => {
        assistant.error(`Failed save user record`, e);
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(1),
      })
      .catch((e) => {
        assistant.error(`Failed to increment user`, e);
      })

    assistant.log(`User created ${user.uid}:`, newUser, user, context);

    return resolve(self);
  });
};

module.exports = Module;
