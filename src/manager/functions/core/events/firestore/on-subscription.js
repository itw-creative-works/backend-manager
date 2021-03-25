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

    let _ = self.Manager.require('lodash');

    let analytics;

    let dataBefore = change.before.data();
    let dataAfter = change.after.data();
    let eventType;
    if (dataAfter == undefined) {
      eventType = 'delete';
    } else if (dataBefore && dataAfter) {
      eventType = 'update';
    } else if (!dataBefore && dataAfter) {
      eventType = 'create';
    }

    assistant.log('Notification subscription write:', {
      after: dataAfter,
      before: dataBefore,
      eventType: eventType,
      resource: context.resource,
      params: context.params,
    }, {environment: 'production'});

    // Delete event
    if (eventType === 'delete') {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(-1),
        })
        .then(r => {
          analytics = self.Manager.Analytics({
            assistant: assistant,
            uuid: _.get(dataBefore, 'link.user.data.uid', undefined),
          })
          .event({
            category: 'engagement',
            action: 'notification-unsubscribe',
            // label: 'regular',
          });
          assistant.log('Notification subscription deleted:', dataBefore, {environment: 'production'});
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })

    // Update event
  } else if (eventType === 'update') {
      // ...

    // Create event
  } else if (eventType === 'create') {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'subscriptions.total': libraries.admin.firestore.FieldValue.increment(1),
        })
        .then(r => {
          analytics = self.Manager.Analytics({
            assistant: assistant,
            uuid: _.get(dataAfter, 'link.user.data.uid', undefined),
          })
          .event({
            category: 'engagement',
            action: 'notification-subscribe',
            // label: 'regular',
          });

          assistant.log('Notification subscription created:', dataAfter, {environment: 'production'});
        })
        .catch(e => {
          assistant.error(e, {environment: 'production'});
        })
    }

  },
}

module.exports = Module;
