const path = require('path');

/**
 * POST /payments/refund
 * Refunds the authenticated user's subscription and cancels it immediately.
 * Requires the subscription to be cancelled or pending cancellation first.
 *
 * Delegates to the processor (e.g., Stripe) to issue the refund and cancel.
 * The resulting webhook triggers the Firestore pipeline which updates subscription state
 * and fires the subscription-cancelled transition handler.
 * Requires authentication.
 */
module.exports = async ({ assistant, user, settings }) => {
  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const uid = user.auth.uid;
  const confirmed = settings.confirmed;

  // Require explicit confirmation
  if (!confirmed) {
    return assistant.respond('Refund must be confirmed', { code: 400 });
  }

  const subscription = user.subscription;

  // Require a paid subscription
  if (!subscription || subscription.product?.id === 'basic') {
    assistant.log(`Refund rejected: uid=${uid}, no paid subscription`);
    return assistant.respond('No paid subscription found', { code: 400 });
  }

  // Require cancelled or pending cancellation — cannot refund an active subscription
  const isCancelled = subscription.status === 'cancelled';
  const isPendingCancel = subscription.cancellation?.pending === true;

  if (!isCancelled && !isPendingCancel) {
    assistant.log(`Refund rejected: uid=${uid}, status=${subscription.status}, pending=${subscription.cancellation?.pending}`);
    return assistant.respond('Subscription must be cancelled or pending cancellation before requesting a refund', { code: 400 });
  }

  // Reject if the most recent payment is older than 6 months
  const startDateUNIX = subscription.payment?.startDate?.timestampUNIX
    || subscription.payment?.updatedBy?.date?.timestampUNIX;

  if (startDateUNIX) {
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);

    if (startDateUNIX < sixMonthsAgo) {
      assistant.log(`Refund rejected: uid=${uid}, payment too old (startDate=${new Date(startDateUNIX).toISOString()})`);
      return assistant.respond('Payments older than 6 months are not eligible for refunds', { code: 400 });
    }
  }

  const processor = subscription.payment?.processor;
  const resourceId = subscription.payment?.resourceId;

  if (!processor || !resourceId) {
    assistant.log(`Refund rejected: uid=${uid}, missing processor=${processor} or resourceId=${resourceId}`);
    return assistant.respond('Subscription payment details not found', { code: 400 });
  }

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
  } catch (e) {
    return assistant.respond(`Unknown processor: ${processor}`, { code: 400 });
  }

  // Process the refund via the processor
  let refund;
  try {
    refund = await processorModule.processRefund({ resourceId, uid, subscription, assistant });
  } catch (e) {
    assistant.log(`Failed to process refund via ${processor}: ${e.message}`);
    return assistant.respond(`Failed to process refund: ${e.message}`, { code: 500, sentry: true });
  }

  assistant.log(`Refund processed: uid=${uid}, processor=${processor}, sub=${resourceId}, amount=${refund.amount}, full=${refund.full}, reason=${settings.reason}`);

  return assistant.respond({ success: true, refund });
};
