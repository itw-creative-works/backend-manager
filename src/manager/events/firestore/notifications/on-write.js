function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;

  // Shortcuts
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();
  self.change = payload.change
  self.context = payload.context

  // Return
  return self;
};

Module.prototype.main = function () {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const assistant = self.assistant;
  const libraries = self.libraries;
  const change = self.change;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Libraries
    const _ = Manager.require('lodash');

    // Shortcuts
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();

    // Variables
    let analytics;
    let eventType;

    // Determine event type
    if (dataAfter == undefined) {
      eventType = 'delete';
    } else if (dataBefore && dataAfter) {
      eventType = 'update';
    } else if (!dataBefore && dataAfter) {
      eventType = 'create';
    }

    // Log
    assistant.log('Notification subscription write:', {
      after: dataAfter,
      before: dataBefore,
      eventType: eventType,
      resource: context.resource,
      params: context.params,
    });

    // Delete event
    if (eventType === 'delete') {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'notifications.total': libraries.admin.firestore.FieldValue.increment(-1),
        })
        .then(r => {
          analytics = Manager.Analytics({
            assistant: assistant,
            uuid: dataBefore?.owner?.uid,
          })
          .event({
            name: 'notification-unsubscribe',
            params: {},
          });

          assistant.log('Notification subscription deleted:', dataBefore);

          return resolve(dataBefore);
        })
        .catch(e => {
          assistant.error(e);
          return reject(e);
        })

    // Update event
  } else if (eventType === 'update') {
    return resolve();

    // Create event
  } else if (eventType === 'create') {
      await libraries.admin.firestore().doc(`meta/stats`)
        .update({
          'notifications.total': libraries.admin.firestore.FieldValue.increment(1),
        })
        .then(r => {
          analytics = Manager.Analytics({
            assistant: assistant,
            uuid: dataAfter?.owner?.uid,
          })
          .event({
            name: 'notification-subscribe',
            params: {},
          });

          assistant.log('Notification subscription created:', dataAfter);

          return resolve(dataAfter);
        })
        .catch(e => {
          assistant.error(e);
          return reject(e);
        })
    }

  });
};


module.exports = Module;
