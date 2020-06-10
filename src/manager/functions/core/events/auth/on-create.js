let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.user = data.user
    this.assistant = Manager.getNewAssistant();

    return this;
  },
  main: async function() {
    let self = this;
    let user = self.user;
    let libraries = self.libraries;
    let assistant = self.assistant;

    let newUser = new self.Manager.User({
      auth: {
        uid: user.uid,
        email: user.email,
      }
    });

    let analytics = new self.Manager.Analytics({
      uuid: user.auth.uid,
    });
    analytics.event({
      category: 'engagement',
      action: 'signup',
      label: 'regular',
    });

    // Add user record
    await libraries.admin.firestore().doc(`users/${newUser.properties.auth.uid}`)
      .set(newUser.properties)
      .catch(e => {
        assistant.error(e);
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(1),
      })
      .catch(e => {
        assistant.error(e);
      })

    assistant.log('User created:', user);
  },
}

module.exports = Module;
