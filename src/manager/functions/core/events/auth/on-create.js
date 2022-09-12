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
    const newUser = self.Manager.User({
      auth: {
        uid: user.uid,
        email: user.email,
      }
    });

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
      return;
    }

    // Add user record
    await libraries.admin.firestore().doc(`users/${newUser.properties.auth.uid}`)
      .set(newUser.properties, {merge: true})
      .catch(e => {
        assistant.error(e, {environment: 'production'});
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(1),
      })
      .catch(e => {
        assistant.error(e, {environment: 'production'});
      })

    assistant.log('User created:', user, {environment: 'production'});
    return resolve(self);      
  });
};

module.exports = Module;
