/**
 * Stripe refund processor
 * Issues a refund for the latest invoice and cancels the subscription immediately.
 *
 * Refund amount:
 * - Full refund if the last payment was ≤7 days ago
 * - Prorated refund (based on days remaining in billing period) if >7 days ago
 *
 * After refunding, if the subscription is still active, it is cancelled immediately.
 * Stripe then sends a customer.subscription.deleted webhook which the existing
 * pipeline processes to update Firestore.
 */
const FULL_REFUND_DAYS = 7;

module.exports = {
  /**
   * Process a refund for a Stripe subscription
   *
   * @param {object} options
   * @param {string} options.resourceId - Stripe subscription ID (e.g., 'sub_xxx')
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.subscription - User's subscription object from Firestore
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {{ amount: number, currency: string, full: boolean }}
   */
  async processRefund({ resourceId, uid, assistant }) {
    const StripeLib = require('../../../../libraries/payment/processors/stripe.js');
    const stripe = StripeLib.init();

    // 1. Retrieve subscription to get latest_invoice
    const sub = await stripe.subscriptions.retrieve(resourceId);

    if (!sub.latest_invoice) {
      throw new Error('No invoice found for this subscription');
    }

    // 2. Retrieve the latest invoice to get payment_intent + timing
    const invoiceId = typeof sub.latest_invoice === 'string'
      ? sub.latest_invoice
      : sub.latest_invoice.id;
    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (!invoice.payment_intent) {
      throw new Error('No payment found for the latest invoice');
    }

    // 3. Calculate refund amount
    const invoicePaidAt = invoice.status_transitions?.paid_at || invoice.created;
    const daysSincePayment = (Date.now() / 1000 - invoicePaidAt) / 86400;
    const invoiceAmount = invoice.amount_paid; // in cents

    if (invoiceAmount <= 0) {
      throw new Error('No refundable amount on the latest invoice');
    }

    let refundAmount;
    let isFullRefund;

    if (daysSincePayment <= FULL_REFUND_DAYS) {
      refundAmount = invoiceAmount;
      isFullRefund = true;
    } else {
      // Prorated: remaining days / total days * amount
      const periodStart = sub.current_period_start || invoice.period_start;
      const periodEnd = sub.current_period_end || invoice.period_end;
      const totalDays = (periodEnd - periodStart) / 86400;
      const daysRemaining = Math.max(0, (periodEnd - Date.now() / 1000) / 86400);

      refundAmount = Math.round((daysRemaining / totalDays) * invoiceAmount);
      isFullRefund = false;
    }

    if (refundAmount <= 0) {
      throw new Error('No refundable amount remaining');
    }

    // 4. Issue the refund
    const paymentIntentId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent.id;

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundAmount,
      reason: 'requested_by_customer',
    });

    assistant.log(`Stripe refund created: refundId=${refund.id}, amount=${refundAmount}, full=${isFullRefund}, uid=${uid}`);

    // 5. Cancel subscription immediately (if not already canceled)
    //    This triggers customer.subscription.deleted webhook → existing pipeline
    if (sub.status !== 'canceled') {
      await stripe.subscriptions.cancel(resourceId);
      assistant.log(`Stripe subscription cancelled immediately: sub=${resourceId}, uid=${uid}`);
    }

    return {
      amount: refundAmount / 100, // convert cents to dollars for response
      currency: refund.currency,
      full: isFullRefund,
    };
  },
};
