function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();
  self.change = payload.change
  self.context = payload.context

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const change = self.change;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const _ = self.Manager.require('lodash');

    const dataBefore = change.before.data();
    const dataAfter = change.after.data();

    let analytics;
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
    });

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
