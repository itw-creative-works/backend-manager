/**
 * Transition: cancellation-requested
 * Triggered when a user requests cancellation at period end (cancellation.pending flips to true)
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  assistant.log(`Transition [subscription/cancellation-requested]: uid=${uid}, product=${after.product?.id}, cancelDate=${after.cancellation?.date?.timestamp}`);

  sendOrderEmail({
    template: 'main/order/cancellation-requested',
    subject: `Your cancellation is confirmed #${order?.id || ''}`,
    categories: ['order/cancellation-requested'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
          ...(after.cancellation?.date?.timestamp && {
            cancellationDate: formatDate(after.cancellation.date.timestamp),
          }),
        },
      },
    },
  });
};
