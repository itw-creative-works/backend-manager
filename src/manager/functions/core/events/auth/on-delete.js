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
    await libraries.admin.firestore().doc(`users/${user.uid}`)
      .delete()
      .catch((e) => {
        assistant.error(`Delete user failed`, e);
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(-1),
      })
      .catch((e) => {
        assistant.error(`Failed to decrement user`, e);
      })

    assistant.log(`User deleted ${user.uid}:`, user, context);

    return resolve(self);
  });
};

module.exports = Module;
