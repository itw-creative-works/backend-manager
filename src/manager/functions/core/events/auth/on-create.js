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

    // Add user record
    await libraries.admin.firestore().doc(`users/${newUser.auth.uid}`)
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

    assistant.log('User created:', user, {environment: 'production'});
  },
}

module.exports = Module;
