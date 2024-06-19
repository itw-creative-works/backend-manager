const fetch = require('wonderful-fetch');

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

    // Set up analytics
    const analytics = Manager.Analytics({
      assistant: assistant,
      uuid: user.uid,
    })
    .event({
      name: 'user-delete',
      params: {},
    });

    // Delete user record
    assistant.log(`Delete user record...`);
    await admin.firestore().doc(`users/${user.uid}`)
      .delete()
      .then((r) => {
        assistant.log(`Delete user record success`);
      })
      .catch((e) => {
        assistant.error(`Delete user record failed`, e);
      })

    // Update user count
    assistant.log(`Decrement user count...`);
    await admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': admin.firestore.FieldValue.increment(-1),
      })
      .then((r) => {
        assistant.log(`Decrement user count success`);
      })
      .catch((e) => {
        assistant.error(`Failed to decrement user`, e);
      })

    // Log the updated user
    assistant.log(`User deleted ${user.uid}:`, user, context);

    // Send response
    return resolve(self);
  });
};

module.exports = Module;
