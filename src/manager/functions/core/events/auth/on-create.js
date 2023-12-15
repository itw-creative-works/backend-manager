const { get, merge } = require('lodash');
const powertools = require('node-powertools');

const MAX_AGE = 30;

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
    // ⛔️⛔️⛔️ This function could be triggered when the user signs up with Google after already having a email/password account

    assistant.log(`Request: ${user.uid}`, user, context);

    const ageInSeconds = (Date.now() - new Date(user.metadata.creationTime)) / 1000;

    // Check if exists already
    let existingUser;
    await powertools.poll(async () => {
      existingUser = await libraries.admin.firestore().doc(`users/${user.uid}`)
        .get()
        .then((doc) => doc.data())
        .catch(e => e);

      assistant.log(`Polling for existing user ${user.uid}...`, existingUser);

      return existingUser && !(existingUser instanceof Error);
    }, {interval: 1000, timeout: 30000})
    .catch(e => {
      assistant.error(`Timeout for existing user expired`, e);
    });

    assistant.log(`Existing user ${user.uid} found (age=${ageInSeconds}):`, existingUser);

    if (ageInSeconds >= MAX_AGE) {
      existingUser = new Error(`User is not new (age=${ageInSeconds}).`);
    }

    // If user already exists, skip auth-on-create handler
    if (existingUser instanceof Error) {
      assistant.error(`Failed to get existing user ${user.uid}:`, existingUser);

      return reject(existingUser);
    }

    // Build user object
    let newUser = self.Manager.User().properties;

    newUser = merge(newUser, existingUser, {
      auth: {
        uid: user.uid,
        email: user.email,
      },
    });

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
