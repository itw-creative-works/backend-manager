const { FieldValue } = require('firebase-admin/firestore');

/**
 * Notification subscription write handler
 *
 * Handles create, update, and delete events for notification subscriptions.
 * Updates stats counters and sends analytics events.
 */
module.exports = async ({ Manager, assistant, change, context, libraries }) => {
  const { admin } = libraries;

  // Shortcuts
  const dataBefore = change.before.data();
  const dataAfter = change.after.data();

  // Determine event type
  let eventType;
  if (dataAfter === undefined) {
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
    await admin.firestore().doc('meta/stats')
      .set({
        notifications: { total: FieldValue.increment(-1) },
      }, { merge: true });

    Manager.Analytics({
      assistant: assistant,
      uuid: dataBefore?.owner?.uid,
    }).event('notification-unsubscribe', {});

    assistant.log('Notification subscription deleted:', dataBefore);

    return dataBefore;
  }

  // Update event
  if (eventType === 'update') {
    return;
  }

  // Create event
  if (eventType === 'create') {
    await admin.firestore().doc('meta/stats')
      .set({
        notifications: { total: FieldValue.increment(1) },
      }, { merge: true });

    Manager.Analytics({
      assistant: assistant,
      uuid: dataAfter?.owner?.uid,
    }).event('notification-subscribe', {});

    assistant.log('Notification subscription created:', dataAfter);

    return dataAfter;
  }
};
