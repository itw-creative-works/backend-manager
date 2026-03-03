/**
 * Transition: payment-recovered
 * Triggered when a suspended subscription is recovered (suspended → active)
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  assistant.log(`Transition [subscription/payment-recovered]: uid=${uid}, product=${after.product?.id}`);

  sendOrderEmail({
    template: 'main/order/payment-recovered',
    subject: `Payment received for order #${order?.id || ''}`,
    categories: ['order/payment-recovered'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
        },
      },
    },
  });
};
