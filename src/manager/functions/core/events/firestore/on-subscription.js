let _;
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

    let analytics;
    _ = self.Manager.require('lodash');

    // Delete event
    if (change.after.data == undefined) {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(-1),
        })
        .then(r => {
          analytics = new self.Manager.Analytics({
            uuid: _.get(change.before.data, 'link.user.data.uid', undefined),
          })
          .event({
            category: 'engagement',
            action: 'notification-unsubscribe',
            // label: 'regular',
          });
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })

        // change.before.data

    // Update event
    } else if (change.before.data && change.after.data) {
      // ...
    // Create event
    } else if (!change.before.data && change.after.data) {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(1),
        })
        .then(r => {
          analytics = new self.Manager.Analytics({
            uuid: _.get(change.after.data, 'link.user.data.uid', undefined),
          })
          .event({
            category: 'engagement',
            action: 'notification-subscribe',
            // label: 'regular',
          });
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })
    }

  },
}

module.exports = Module;
