/**
 * Transition: payment-failed
 * Triggered when a subscription payment fails (active → suspended)
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  assistant.log(`Transition [subscription/payment-failed]: uid=${uid}, product=${after.product?.id}, previousStatus=${before?.status}`);

  sendOrderEmail({
    template: 'order',
    subject: `Payment failed for order #${order?.id || ''}`,
    categories: ['order/payment-failed'],
    userDoc,
    assistant,
    data: {
      content: { event: 'payment-failed',
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
        },
      },
    },
  });
};
