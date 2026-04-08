const powertools = require('node-powertools');

/**
 * Expire PayPal pending cancellations
 *
 * PayPal has no cancel_at_period_end like Stripe — cancellation is immediate on PayPal's side.
 * BEM keeps users active with cancellation.pending=true until the billing period ends.
 * Since PayPal does NOT fire a webhook at period end, this cron job transitions those
 * users to 'cancelled' status once their paid period has expired.
 *
 * Flow:
 * 1. Query users with PayPal subscriptions where cancellation.pending=true
 * 2. Check if subscription.expires.timestampUNIX < now
 * 3. Update status to 'cancelled' and cancellation.pending to false
 * 4. Dispatch 'subscription-cancelled' transition (sends email)
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const { admin } = libraries;
  const transitions = require('../../firestore/payments-webhooks/transitions/index.js');

  const now = new Date();
  const nowStr = powertools.timestamp(now, { output: 'string' });
  const nowUNIX = powertools.timestamp(nowStr, { output: 'unix' });

  assistant.log('Checking for expired PayPal pending cancellations...');

  let processed = 0;
  let skipped = 0;

  await Manager.Utilities().iterateCollection(async (batch, index) => {
    for (const doc of batch.docs) {
      const data = doc.data();
      const sub = data.subscription;
      const uid = doc.id;

      // Double-check: skip if expires is in the future
      if (!sub?.expires?.timestampUNIX || sub.expires.timestampUNIX > nowUNIX) {
        assistant.log(`[skip] ${uid}: expires=${sub?.expires?.timestamp || 'null'} is still in the future (now=${nowStr})`);
        skipped++;
        continue;
      }

      assistant.log(`[expire] ${uid}: expires=${sub.expires.timestamp}, product=${sub.product?.id}, processor=${sub.payment?.processor}, orderId=${sub.payment?.orderId || 'null'}`);

      // Snapshot the before state for transition detection
      const before = { ...sub };

      // Build the after state — transition to cancelled
      const after = {
        ...sub,
        status: 'cancelled',
        cancellation: {
          ...sub.cancellation,
          pending: false,
        },
      };

      // Write to Firestore
      await doc.ref.set({ subscription: after }, { merge: true });

      assistant.log(`[expire] ${uid}: Updated status=cancelled, cancellation.pending=false`);

      // Detect and dispatch transition (should fire 'subscription-cancelled')
      const transitionName = transitions.detectTransition('subscription', before, after, null);

      if (transitionName) {
        assistant.log(`[expire] ${uid}: Transition detected: subscription/${transitionName}`);

        // Build minimal order context for the handler
        const order = {
          id: sub.payment?.orderId || null,
          type: 'subscription',
          owner: uid,
          processor: 'paypal',
          resourceId: sub.payment?.resourceId || null,
          unified: after,
        };

        transitions.dispatch(transitionName, 'subscription', {
          before,
          after,
          order,
          uid,
          userDoc: data,
          assistant,
        });
      } else {
        assistant.log(`[expire] ${uid}: No transition detected (before.status=${before.status}, after.status=${after.status})`);
      }

      processed++;
    }
  }, {
    collection: 'users',
    where: [
      { field: 'subscription.payment.processor', operator: '==', value: 'paypal' },
      { field: 'subscription.cancellation.pending', operator: '==', value: true },
    ],
    batchSize: 5000,
    log: true,
  });

  assistant.log(`Completed! Processed=${processed}, Skipped=${skipped}`);
};
