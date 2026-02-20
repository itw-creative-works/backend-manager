const powertools = require('node-powertools');

/**
 * Firestore trigger: payments-webhooks/{eventId} onWrite
 *
 * Processes pending webhook events:
 * 1. Transforms raw processor data into unified subscription object
 * 2. Updates the user's subscription in users/{uid}
 * 3. Stores the subscription doc in payments-subscriptions/{resourceId}
 * 4. Marks the webhook as completed
 */
module.exports = async ({ Manager, assistant, change, context, libraries }) => {
  const { admin } = libraries;

  const dataAfter = change.after.data();

  // Short-circuit: deleted doc or non-pending status
  if (!dataAfter || dataAfter.status !== 'pending') {
    return;
  }

  const eventId = context.params.eventId;
  const webhookRef = admin.firestore().doc(`payments-webhooks/${eventId}`);

  // Set status to processing
  await webhookRef.set({ status: 'processing' }, { merge: true });

  try {
    const processor = dataAfter.processor;
    const uid = dataAfter.uid;
    const raw = dataAfter.raw;
    const eventType = dataAfter.event?.type;

    assistant.log(`Processing webhook ${eventId}: processor=${processor}, eventType=${eventType}, uid=${uid || 'null'}`);

    // Validate UID
    if (!uid) {
      throw new Error('Webhook event has no UID — cannot process');
    }

    // Load the shared library for this processor (only needs toUnified, not SDK init)
    let library;
    try {
      library = require(`../../../libraries/${processor}.js`);
    } catch (e) {
      throw new Error(`Unknown processor library: ${processor}`);
    }

    // Extract the subscription object from the raw event
    // Stripe sends events with event.data.object as the subscription
    const rawSubscription = raw.data?.object || {};

    assistant.log(`Raw subscription: stripeStatus=${rawSubscription.status}, cancelAtPeriodEnd=${rawSubscription.cancel_at_period_end}, trialEnd=${rawSubscription.trial_end || 'none'}, resourceId=${rawSubscription.id}`);

    // Transform raw data into unified subscription object
    const unified = library.toUnified(rawSubscription, {
      config: Manager.config,
      eventName: eventType,
      eventId: eventId,
    });

    assistant.log(`Unified result: status=${unified.status}, product=${unified.product.id}, frequency=${unified.payment.frequency}, trial.claimed=${unified.trial.claimed}, cancellation.pending=${unified.cancellation.pending}`, unified);

    // Build timestamps
    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    /**
     * POTENTIAL ENHANCEMENT:
     * Check the time of the incoming event against the metadata.updated.timestamp.
     * If the incoming event is older than the last update, it may be a delayed webhook and we should skip processing to avoid overwriting newer subscription data with stale data. This would require storing the timestamp of the last processed event in the user's subscription metadata and comparing it here before proceeding with the update.
     *
     * Also, consider re-fetching the actual resource
     */

    // Write unified subscription to user doc
    await admin.firestore().doc(`users/${uid}`).set({
      subscription: unified,
    }, { merge: true });

    assistant.log(`Updated users/${uid}.subscription: status=${unified.status}, product=${unified.product.id}`);

    // Write to payments-subscriptions/{resourceId}
    const resourceId = unified.payment.resourceId;
    if (resourceId) {
      await admin.firestore().doc(`payments-subscriptions/${resourceId}`).set({
        uid: uid,
        processor: processor,
        subscription: unified,
        raw: rawSubscription,
        metadata: {
          created: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
          updated: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
          updatedBy: {
            event: {
              name: eventType,
              id: eventId,
            },
          },
        },
      }, { merge: true });

      assistant.log(`Updated payments-subscriptions/${resourceId}: uid=${uid}, eventType=${eventType}`);
    } else {
      assistant.log(`No resourceId in unified result, skipping payments-subscriptions write`);
    }

    // Mark webhook as completed
    await webhookRef.set({
      status: 'completed',
      uid: uid,
      metadata: {
        processed: {
          timestamp: now,
          timestampUNIX: nowUNIX,
        },
      },
    }, { merge: true });

    assistant.log(`Webhook ${eventId} completed: wrote users/${uid}, payments-subscriptions/${resourceId || 'skipped'}, payments-webhooks/${eventId}=completed`);
  } catch (e) {
    assistant.error(`Webhook ${eventId} failed: ${e.message}`, e);

    // Mark as failed with error message
    await webhookRef.set({
      status: 'failed',
      error: e.message || String(e),
    }, { merge: true });
  }
};
