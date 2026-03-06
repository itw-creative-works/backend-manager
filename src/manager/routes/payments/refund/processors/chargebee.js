/**
 * Chargebee refund processor
 * Issues a refund for the latest invoice and cancels the subscription immediately.
 *
 * Refund amount:
 * - Full refund if the last payment was ≤7 days ago
 * - Prorated refund (based on days remaining in billing period) if >7 days ago
 *
 * Chargebee refunds are issued on invoices via POST /invoices/{id}/refund.
 * After refunding, the subscription is cancelled immediately.
 */
const FULL_REFUND_DAYS = 7;

module.exports = {
  /**
   * Process a refund for a Chargebee subscription
   *
   * @param {object} options
   * @param {string} options.resourceId - Chargebee subscription ID
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.subscription - User's subscription object from Firestore
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {{ amount: number, currency: string, full: boolean }}
   */
  async processRefund({ resourceId, uid, assistant }) {
    const ChargebeeLib = require('../../../../libraries/payment/processors/chargebee.js');
    ChargebeeLib.init();

    // 1. Retrieve subscription
    const subResult = await ChargebeeLib.request(`/subscriptions/${resourceId}`);
    const sub = subResult.subscription;

    // 2. Find the latest paid invoice for this subscription
    const invoiceResult = await ChargebeeLib.request(
      `/invoices?subscription_id[is]=${encodeURIComponent(resourceId)}&status[is]=paid&sort_by[desc]=date&limit=1`,
    );

    const invoices = invoiceResult.list || [];

    if (invoices.length === 0) {
      throw new Error('No paid invoice found for this subscription');
    }

    const invoice = invoices[0].invoice;
    const invoiceAmountCents = invoice.amount_paid || invoice.total || 0;

    if (invoiceAmountCents <= 0) {
      throw new Error('No refundable amount on the latest invoice');
    }

    // 3. Calculate refund amount
    const invoicePaidAt = invoice.paid_at || invoice.date;
    const daysSincePayment = (Date.now() / 1000 - invoicePaidAt) / 86400;

    let refundAmountCents;
    let isFullRefund;

    if (daysSincePayment <= FULL_REFUND_DAYS) {
      refundAmountCents = invoiceAmountCents;
      isFullRefund = true;
    } else {
      // Prorated: remaining days / total days * amount
      const periodStart = sub.current_term_start || invoice.date;
      const periodEnd = sub.current_term_end || (invoice.date + 86400 * 30);
      const totalDays = (periodEnd - periodStart) / 86400;
      const daysRemaining = Math.max(0, (periodEnd - Date.now() / 1000) / 86400);

      refundAmountCents = Math.round((daysRemaining / totalDays) * invoiceAmountCents);
      isFullRefund = false;
    }

    if (refundAmountCents <= 0) {
      throw new Error('No refundable amount remaining');
    }

    // 4. Issue refund on the invoice
    await ChargebeeLib.request(`/invoices/${invoice.id}/refund`, {
      method: 'POST',
      body: { refund_amount: refundAmountCents },
    });

    const currency = invoice.currency_code || 'USD';

    assistant.log(`Chargebee refund issued: invoiceId=${invoice.id}, amount=${refundAmountCents}, full=${isFullRefund}, uid=${uid}`);

    // 5. Cancel subscription immediately (if not already cancelled)
    if (sub.status !== 'cancelled') {
      await ChargebeeLib.request(`/subscriptions/${resourceId}/cancel_for_items`, {
        method: 'POST',
        body: { cancel_option: 'immediately' },
      });
      assistant.log(`Chargebee subscription cancelled immediately: sub=${resourceId}, uid=${uid}`);
    }

    return {
      amount: refundAmountCents / 100,
      currency: currency.toLowerCase(),
      full: isFullRefund,
    };
  },
};
