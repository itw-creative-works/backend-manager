const moment = require('moment');

const StripeLib = require('../../../../libraries/payment/processors/stripe.js');

/**
 * Stripe dispute processor
 *
 * Implements the dispute processor interface for Stripe:
 *   - searchAndMatch(alert, assistant) → match | null
 *   - processDispute(match, alert, assistant) → result
 *
 * Match strategy: search charges by amount + date range, then confirm card last4.
 * If alert.chargeId is provided (alert.updated events), verify it directly — otherwise
 * fall back to the charge search. Both paths go through the same resolveMatchFromCharge()
 * so the returned match shape is always identical.
 *
 * We use charges.search() rather than invoices.search() because Stripe invoices can have
 * a null charge field even when paid (payment applied via credit/balance), making invoice
 * search unreliable. Charges always have payment_method_details.card.last4.
 */

/**
 * Find the Stripe charge matching this dispute alert.
 *
 * If alert.chargeId is present (Chargeblast alert.updated), verify it directly.
 * Otherwise search charges by amount + ±2 day window and match card last4.
 *
 * @param {object} alert - Normalized alert data
 * @param {object} assistant - Assistant instance
 * @returns {object|null} Match details or null
 */
async function searchAndMatch(alert, assistant) {
  const stripe = StripeLib.init();

  // If Chargeblast already gave us the charge ID, verify it directly
  if (alert.chargeId && alert.chargeId.startsWith('ch_')) {
    assistant.log(`Direct charge lookup: ${alert.chargeId}`);

    try {
      const charge = await stripe.charges.retrieve(alert.chargeId, {
        expand: ['invoice', 'invoice.subscription', 'customer'],
      });
      return resolveMatchFromCharge({ charge, stripe, assistant });
    } catch (e) {
      assistant.log(`Direct charge lookup failed for ${alert.chargeId}: ${e.message}`);
    }
  }

  // Search charges by amount + date range, match card last4
  const amountCents = Math.round(alert.amount * 100);
  const alertDate = moment(alert.transactionDate);

  if (!alertDate.isValid()) {
    throw new Error(`Invalid transactionDate: ${alert.transactionDate}`);
  }

  const start = alertDate.clone().subtract(2, 'days').unix();
  const end = alertDate.clone().add(2, 'days').unix();

  assistant.log(`Searching charges: amount=${amountCents} cents, range=${moment.unix(start).format('YYYY-MM-DD')} to ${moment.unix(end).format('YYYY-MM-DD')}, last4=${alert.card.last4}`);

  const charges = await stripe.charges.search({
    limit: 100,
    query: `amount:${amountCents} AND created>${start} AND created<${end}`,
  });

  if (!charges.data.length) {
    assistant.log(`No charges found for amount=${amountCents} in date range`);
    return null;
  }

  if (charges.data.length >= 100) {
    assistant.log(`Warning: 100+ charges found, results may be truncated`);
  }

  assistant.log(`Found ${charges.data.length} charge(s), matching last4=${alert.card.last4}`);

  for (const charge of charges.data) {
    const chargeLast4 = charge.payment_method_details?.card?.last4;

    if (!chargeLast4 || chargeLast4 !== alert.card.last4) {
      continue;
    }

    // Fetch full charge with invoice + subscription expanded
    try {
      const fullCharge = await stripe.charges.retrieve(charge.id, {
        expand: ['invoice', 'invoice.subscription', 'customer'],
      });
      return resolveMatchFromCharge({ charge: fullCharge, stripe, assistant });
    } catch (e) {
      assistant.log(`Failed to expand charge ${charge.id}: ${e.message}`);
    }
  }

  assistant.log(`No charge matched last4=${alert.card.last4}`);
  return null;
}

/**
 * Issue a refund and cancel the subscription for a matched dispute.
 *
 * @param {object} match - Match details from searchAndMatch
 * @param {object} alert - Normalized alert data
 * @param {object} assistant - Assistant instance
 * @returns {object} Result with statuses
 */
async function processDispute(match, alert, assistant) {
  const stripe = StripeLib.init();

  const amountCents = Math.round(alert.amount * 100);
  const result = {
    refundId: null,
    amountRefunded: null,
    currency: null,
    refundStatus: 'skipped',
    cancelStatus: 'skipped',
    errors: [],
  };

  // Issue full refund
  if (match.chargeId) {
    try {
      // Idempotency key scoped to the charge prevents double-refund when the
      // Firestore trigger fires more than once (retries, re-delivered webhooks,
      // etc.). Stripe caches the response for 24 hours.
      const refund = await stripe.refunds.create({
        charge: match.chargeId,
        amount: amountCents,
      }, {
        idempotencyKey: `bem-dispute-refund-${match.chargeId}`,
      });

      result.refundId = refund.id;
      result.amountRefunded = amountCents;
      result.currency = refund.currency;
      result.refundStatus = 'success';

      assistant.log(`Refund success: refundId=${refund.id}, amount=${amountCents}, charge=${match.chargeId}`);
    } catch (e) {
      result.refundStatus = 'failed';
      result.errors.push(`Refund failed: ${e.message}`);
      assistant.error(`Refund failed for charge ${match.chargeId}: ${e.message}`);
    }
  }

  // Cancel subscription immediately
  // Stripe fires customer.subscription.deleted webhook → existing pipeline handles user doc update
  if (match.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(match.subscriptionId);
      result.cancelStatus = 'success';

      assistant.log(`Subscription cancelled: sub=${match.subscriptionId}`);
    } catch (e) {
      result.cancelStatus = 'failed';
      result.errors.push(`Cancel failed: ${e.message}`);
      assistant.error(`Cancel failed for sub ${match.subscriptionId}: ${e.message}`);
    }
  }

  return result;
}

module.exports = { searchAndMatch, processDispute };

// ---

/**
 * Build a match object from a Stripe charge (with invoice + subscription already expanded).
 *
 * @param {object} options.charge - Stripe charge with invoice + customer expanded
 * @param {object} options.stripe - Stripe SDK instance
 * @param {object} options.assistant - Assistant instance
 * @returns {object|null}
 */
async function resolveMatchFromCharge({ charge, stripe, assistant }) {
  if (!charge || charge.status !== 'succeeded') {
    assistant.log(`Charge ${charge?.id} status=${charge?.status}, skipping`);
    return null;
  }

  // Resolve UID + email from customer
  let uid = null;
  let email = null;
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;

  if (charge.customer && typeof charge.customer === 'object') {
    uid = charge.customer.metadata?.uid || null;
    email = charge.customer.email || null;
  } else if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      uid = customer.metadata?.uid || null;
      email = customer.email || null;
    } catch (e) {
      assistant.error(`Failed to retrieve customer ${customerId}: ${e.message}`);
    }
  }

  // Resolve invoice + subscription from expanded invoice
  const invoice = typeof charge.invoice === 'object' ? charge.invoice : null;
  const invoiceId = invoice?.id || (typeof charge.invoice === 'string' ? charge.invoice : null);
  const subscriptionId = invoice?.subscription
    ? (typeof invoice.subscription === 'object' ? invoice.subscription.id : invoice.subscription)
    : null;

  assistant.log(`Matched charge=${charge.id}, customer=${customerId}, uid=${uid}, invoice=${invoiceId}, subscription=${subscriptionId}`);

  return {
    chargeId: charge.id,
    invoiceId: invoiceId,
    subscriptionId: subscriptionId,
    customerId: customerId,
    uid: uid,
    email: email,
  };
}
