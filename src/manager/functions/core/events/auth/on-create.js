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
      uuid: user.uid,
    });


    // Don't save if anonymous
    if (user.providerData.length < 1) {
      return;
    } else if (user.providerData.filter(function (item) {
      return item.providerId === 'anonymous';
    }).length > 0) {
      return;
    }

    analytics.event({
      category: 'engagement',
      action: 'signup',
      label: 'regular',
    });

    // Add user record
    await libraries.admin.firestore().doc(`users/${newUser.properties.auth.uid}`)
      .set(newUser.properties, {merge: true})
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
