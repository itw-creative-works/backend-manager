const path = require('path');

/**
 * POST /payments/cancel
 * Cancels the authenticated user's subscription at the end of the current billing period.
 * Delegates to the processor (e.g., Stripe) to set cancel_at_period_end=true.
 * The resulting webhook triggers the Firestore pipeline which updates subscription state
 * and fires the cancellation-requested transition handler.
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
    return assistant.respond('Cancellation must be confirmed', { code: 400 });
  }

  const subscription = user.subscription;

  // Require an active, paid subscription
  if (!subscription || subscription.status !== 'active' || subscription.product?.id === 'basic') {
    assistant.log(`Cancel rejected: uid=${uid}, status=${subscription?.status}, product=${subscription?.product?.id}`);
    return assistant.respond('No active paid subscription found', { code: 400 });
  }

  // Guard: already pending cancellation
  if (subscription.cancellation?.pending === true) {
    assistant.log(`Cancel rejected: uid=${uid}, cancellation already pending`);
    return assistant.respond('Subscription is already pending cancellation', { code: 400 });
  }

  const processor = subscription.payment?.processor;
  const resourceId = subscription.payment?.resourceId;

  if (!processor || !resourceId) {
    assistant.log(`Cancel rejected: uid=${uid}, missing processor=${processor} or resourceId=${resourceId}`);
    return assistant.respond('Subscription payment details not found', { code: 400 });
  }

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
  } catch (e) {
    return assistant.respond(`Unknown processor: ${processor}`, { code: 400 });
  }

  // Cancel at period end via the processor
  try {
    await processorModule.cancelAtPeriodEnd({ resourceId, uid, subscription, assistant });
  } catch (e) {
    assistant.log(`Failed to cancel subscription via ${processor}: ${e.message}`);
    return assistant.respond(`Failed to cancel subscription: ${e.message}`, { code: 500, sentry: true });
  }

  assistant.log(`Cancel at period end scheduled: uid=${uid}, processor=${processor}, sub=${resourceId}, reason=${settings.reason}`);

  return assistant.respond({ success: true });
};
