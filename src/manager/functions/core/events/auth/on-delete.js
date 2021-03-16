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

    let analytics = self.Manager.Analytics({
      assistant: assistant,
      uuid: user.uid,
    })
    .event({
      category: 'engagement',
      action: 'user-delete',
      // label: 'regular',
    });

    // Add user record
    await libraries.admin.firestore().doc(`users/${user.uid}`)
      .delete()
      .catch(e => {
        assistant.error(e);
      })

    // Update user count
    await libraries.admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': libraries.admin.firestore.FieldValue.increment(-1),
      })
      .catch(e => {
        assistant.error(e);
      })

    assistant.log('User deleted:', user, {environment: 'production'});
  },
}

module.exports = Module;
