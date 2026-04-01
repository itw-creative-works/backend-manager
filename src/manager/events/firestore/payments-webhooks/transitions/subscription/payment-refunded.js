/**
 * Transition: payment-refunded
 * Triggered when a payment refund webhook is received.
 *
 * Processor-agnostic — refund details are extracted by the processor library's
 * getRefundDetails() method and passed as a unified { amount, currency, reason } object.
 *
 * This is webhook-driven so it fires regardless of how the refund originated
 * (admin dashboard, user self-service, or direct processor action).
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant, refundDetails }) {
  assistant.log(`Transition [subscription/payment-refunded]: uid=${uid}, product=${after?.product?.id}, amount=${refundDetails?.amount} ${refundDetails?.currency}, reason=${refundDetails?.reason || 'none'}`);

  sendOrderEmail({
    template: 'core/order/refunded',
    subject: `Your payment has been refunded #${order?.id || ''}`,
    categories: ['order/refunded'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
          refundAmount: refundDetails?.amount || null,
          refundCurrency: refundDetails?.currency || 'USD',
          refundReason: refundDetails?.reason || null,
        },
      },
    },
  });
};
