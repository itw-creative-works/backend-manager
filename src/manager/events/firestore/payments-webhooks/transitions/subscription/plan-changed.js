/**
 * Transition: plan-changed
 * Triggered when a user upgrades or downgrades their plan (product A → product B, both active + paid)
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  const direction = (after.product?.id || '') > (before.product?.id || '') ? 'upgrade' : 'downgrade';
  assistant.log(`Transition [subscription/plan-changed]: uid=${uid}, ${before.product?.id} → ${after.product?.id} (${direction})`);

  sendOrderEmail({
    template: 'main/order/plan-changed',
    subject: `Your plan has been updated #${order?.id || ''}`,
    categories: ['order/plan-changed'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        // Inject previous plan info into the unified object for the template
        unified: {
          ...order.unified,
          previous: {
            product: before.product,
            price: before.payment?.price || 0,
          },
        },
        _computed: {
          date: formatDate(new Date().toISOString()),
        },
      },
    },
  });
};
