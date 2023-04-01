function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();
  self.user = payload.user

  return self;  
};

Module.prototype.main = function () {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const user = self.user;

  return new Promise(async function(resolve, reject) {
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
        assistant.error(`auth-on-delete: Delete user failed`, e, {environment: 'production'});
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(-1),
      })
      .catch((e) => {
        assistant.error(`auth-on-delete: Failed to decrement user`, e, {environment: 'production'});
      })

    assistant.log(`auth-on-delete: User deleted ${user.uid}:`, user, {environment: 'production'}); 
    
    return resolve(self);
  });
};

module.exports = Module;
