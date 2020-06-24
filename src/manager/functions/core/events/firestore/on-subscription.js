let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant();
    this.change = data.change
    this.context = data.context

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let change = self.change;
    let context = self.context;

    if (change.after.data == undefined) {
      // Deleted: data before but no data after
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(-1),
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })
      // console.log('Deleted');
    } else if (change.before.data && change.after.data) {
      // Updated: data before and data after
      // console.log('Update');
    } else if (!change.before.data && change.after.data) {
      // Created: no data before but data after
      // console.log('Created');
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(1),
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })
    }

    // assistant.log('User created:', user);
  },
}

module.exports = Module;
