/**
 * PayPal refund processor
 * Refunds the most recent payment on a PayPal subscription and cancels it.
 *
 * PayPal refunds are issued against individual sale/capture transactions,
 * not against the subscription itself. We find the most recent completed
 * transaction and refund it.
 */
const FULL_REFUND_DAYS = 7;

module.exports = {
  /**
   * Process a refund for a PayPal subscription
   *
   * @param {object} options
   * @param {string} options.resourceId - PayPal subscription ID (e.g., 'I-xxx')
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {{ amount: number, currency: string, full: boolean }}
   */
  async processRefund({ resourceId, uid, assistant }) {
    const PayPalLib = require('../../../../libraries/payment/processors/paypal.js');

    // 1. Get subscription transactions to find the latest payment
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const transactions = await PayPalLib.request(
      `/v1/billing/subscriptions/${resourceId}/transactions?start_time=${oneYearAgo.toISOString()}&end_time=${now.toISOString()}`
    );

    const completedTransactions = (transactions.transactions || [])
      .filter(t => t.status === 'COMPLETED')
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    if (completedTransactions.length === 0) {
      throw new Error('No completed transactions found for this subscription');
    }

    const latestTransaction = completedTransactions[0];
    const saleId = latestTransaction.id;
    const transactionAmount = parseFloat(latestTransaction.amount_with_breakdown?.gross_amount?.value || '0');
    const currency = latestTransaction.amount_with_breakdown?.gross_amount?.currency_code || 'USD';

    if (transactionAmount <= 0) {
      throw new Error('No refundable amount on the latest transaction');
    }

    // 2. Calculate refund amount
    const transactionDate = new Date(latestTransaction.time);
    const daysSincePayment = (now - transactionDate) / (1000 * 60 * 60 * 24);

    let refundAmount;
    let isFullRefund;

    if (daysSincePayment <= FULL_REFUND_DAYS) {
      refundAmount = transactionAmount;
      isFullRefund = true;
    } else {
      // Prorated refund — estimate based on billing cycle
      // PayPal doesn't expose period start/end per transaction like Stripe
      // Approximate: 30 days for monthly, 365 for yearly
      const sub = await PayPalLib.request(`/v1/billing/subscriptions/${resourceId}`);
      const nextBilling = sub.billing_info?.next_billing_time
        ? new Date(sub.billing_info.next_billing_time)
        : null;

      if (nextBilling) {
        const totalDays = (nextBilling - transactionDate) / (1000 * 60 * 60 * 24);
        const daysRemaining = Math.max(0, (nextBilling - now) / (1000 * 60 * 60 * 24));
        refundAmount = Math.round((daysRemaining / totalDays) * transactionAmount * 100) / 100;
      } else {
        // Fallback: half refund
        refundAmount = Math.round(transactionAmount * 50) / 100;
      }

      isFullRefund = false;
    }

    if (refundAmount <= 0) {
      throw new Error('No refundable amount remaining');
    }

    // 3. Issue the refund against the sale/capture
    await PayPalLib.request(`/v2/payments/captures/${saleId}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        amount: {
          value: refundAmount.toFixed(2),
          currency_code: currency,
        },
        note_to_payer: 'Subscription refund',
      }),
    });

    assistant.log(`PayPal refund issued: saleId=${saleId}, amount=${refundAmount}, full=${isFullRefund}, uid=${uid}`);

    // 4. Cancel the subscription
    try {
      await PayPalLib.request(`/v1/billing/subscriptions/${resourceId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Refund requested' }),
      });
      assistant.log(`PayPal subscription cancelled after refund: sub=${resourceId}, uid=${uid}`);
    } catch (e) {
      // Already cancelled — that's fine
      assistant.log(`PayPal subscription cancel after refund failed (may already be cancelled): ${e.message}`);
    }

    return {
      amount: refundAmount,
      currency: currency.toLowerCase(),
      full: isFullRefund,
    };
  },
};
