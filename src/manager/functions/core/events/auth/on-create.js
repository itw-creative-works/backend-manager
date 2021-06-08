let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant();
    this.user = data.user

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let user = self.user;

    let newUser = self.Manager.User({
      auth: {
        uid: user.uid,
        email: user.email,
      }
    });

    let analytics = self.Manager.Analytics({
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
  },
}

module.exports = Module;
