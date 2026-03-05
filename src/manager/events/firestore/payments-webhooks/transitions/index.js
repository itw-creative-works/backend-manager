/**
 * Payment transition detection and dispatch
 *
 * Compares subscription state before and after a webhook to detect meaningful
 * transitions (e.g., new subscription, payment failed, cancellation).
 * Dispatches to individual handler files for each transition type.
 */
const path = require('path');

/**
 * Detect what transition occurred based on category and before/after state
 *
 * @param {string} category - 'subscription' or 'one-time'
 * @param {object|null} before - Previous state (null for new users / one-time)
 * @param {object} after - New unified state about to be written
 * @param {string} eventType - Original webhook event type (used for one-time detection)
 * @returns {string|null} Transition name or null if no meaningful change
 */
function detectTransition(category, before, after, eventType) {
  if (category === 'subscription') {
    return detectSubscriptionTransition(before, after, eventType);
  }

  if (category === 'one-time') {
    return detectOneTimeTransition(eventType);
  }

  return null;
}

/**
 * Detect subscription state transitions by comparing before and after
 *
 * Checks are ordered by specificity — most specific first to avoid misclassification.
 *
 * @param {object|null} before - Previous users/{uid}.subscription (null/undefined for new users)
 * @param {object} after - New unified subscription
 * @returns {string|null} Transition name
 */
function detectSubscriptionTransition(before, after, eventType) {
  if (!after) {
    return null;
  }

  // Refund events take priority — detected by webhook event type rather than state diff
  // because the subscription state may not change meaningfully during a refund
  const refundEvents = ['PAYMENT.SALE.REFUNDED', 'charge.refunded'];
  if (refundEvents.includes(eventType)) {
    return 'payment-refunded';
  }

  const beforeStatus = before?.status;
  const afterStatus = after.status;

  // 1. new-subscription: basic/null → active paid (handler checks after.trial.claimed for trial info)
  if (isBasicOrNull(before) && afterStatus === 'active' && isPaid(after)) {
    return 'new-subscription';
  }

  // 2. payment-failed: active → suspended
  if (beforeStatus === 'active' && afterStatus === 'suspended') {
    return 'payment-failed';
  }

  // 3. payment-recovered: suspended → active
  if (beforeStatus === 'suspended' && afterStatus === 'active') {
    return 'payment-recovered';
  }

  // 4. cancellation-requested: pending flips from false → true while still active
  if (afterStatus === 'active' && !before?.cancellation?.pending && after.cancellation?.pending) {
    return 'cancellation-requested';
  }

  // 5. subscription-cancelled: any non-cancelled → cancelled
  if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') {
    return 'subscription-cancelled';
  }

  // 6. plan-changed: both active, both paid, different product
  if (
    beforeStatus === 'active'
    && afterStatus === 'active'
    && isPaid(before)
    && isPaid(after)
    && before.product.id !== after.product.id
  ) {
    return 'plan-changed';
  }

  return null;
}

/**
 * Detect one-time payment transitions from event type
 * Simpler than subscriptions — no before/after comparison needed
 *
 * @param {string} eventType - Webhook event type
 * @returns {string|null} Transition name
 */
function detectOneTimeTransition(eventType) {
  // Stripe
  if (eventType === 'checkout.session.completed') {
    return 'purchase-completed';
  }

  if (eventType === 'invoice.payment_failed') {
    return 'purchase-failed';
  }

  // PayPal
  if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    return 'purchase-completed';
  }

  return null;
}

/**
 * Dispatch a transition handler (fire-and-forget)
 *
 * @param {string} transitionName - e.g., 'new-subscription', 'payment-failed'
 * @param {string} category - 'subscription' or 'one-time'
 * @param {object} context - Full context passed to the handler
 */
function dispatch(transitionName, category, context) {
  const { assistant } = context;

  try {
    const handlerPath = path.join(__dirname, category, `${transitionName}.js`);
    const handler = require(handlerPath);

    // Fire-and-forget — don't block the main webhook processing
    Promise.resolve(handler(context)).catch((e) => {
      assistant.error(`Transition handler [${category}/${transitionName}] failed: ${e.message}`, e);
    });
  } catch (e) {
    // Handler file doesn't exist or can't be loaded — log but don't fail
    assistant.error(`Transition handler [${category}/${transitionName}] not found: ${e.message}`);
  }
}

// ─── Helpers ───

function isBasicOrNull(sub) {
  return !sub || !sub.product || sub.product.id === 'basic';
}

function isPaid(sub) {
  return sub && sub.product && sub.product.id !== 'basic';
}

module.exports = {
  detectTransition,
  detectSubscriptionTransition,
  detectOneTimeTransition,
  dispatch,
  // Exported for testing
  isBasicOrNull,
  isPaid,
};
