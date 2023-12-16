const fetch = require('wonderful-fetch');

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
    assistant.log(`Request: ${user.uid}`, user, context);

    // Set up analytics
    const analytics = self.Manager.Analytics({
      assistant: assistant,
      uuid: user.uid,
    })
    .event({
      category: 'engagement',
      action: 'user-delete',
      // label: 'regular',
    });

    // Delete user record
    assistant.log(`Delete user record...`);
    await libraries.admin.firestore().doc(`users/${user.uid}`)
      .delete()
      .then((r) => {
        assistant.log(`Delete user record success`);
      })
      .catch((e) => {
        assistant.error(`Delete user record failed`, e);
      })

    // Signout of all sessions
    assistant.log(`Signout of all sessions...`);
    await fetch(`https://us-central1-${self.Manager.project.projectId}.cloudfunctions.net/bm_api`, {
      method: 'post',
      timeout: 30000,
      response: 'json',
      tries: 2,
      log: true,
      body: {
        backendManagerKey: self.Manager.config.backend_manager.key,
        command: 'user:sign-out-all-sessions',
        payload: {
          uid: user.uid,
        }
      },
    })
    .then((json) => {
      assistant.log(`Signout of all sessions success`, json);
    })
    .catch(e => {
      assistant.error(`Signout of all sessions failed`, e);
    })

    // Update user count
    assistant.log(`Decrement user count...`);
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(-1),
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
