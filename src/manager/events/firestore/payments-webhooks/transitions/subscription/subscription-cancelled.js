/**
 * Transition: subscription-cancelled
 * Triggered when a subscription is fully cancelled (any non-cancelled → cancelled)
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  assistant.log(`Transition [subscription/subscription-cancelled]: uid=${uid}, previousProduct=${before?.product?.id}, previousStatus=${before?.status}`);

  // Check if subscription has a future expiry (e.g., cancelled at period end)
  // Trials don't get future access — cancelling a trial revokes access immediately
  const isTrial = after.trial?.claimed;
  const hasFutureExpiry = !isTrial && after.expires?.timestamp && new Date(after.expires.timestamp) > new Date();

  sendOrderEmail({
    template: 'main/order/cancelled',
    subject: `Your subscription has been cancelled #${order?.id || ''}`,
    categories: ['order/cancelled'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
          ...(hasFutureExpiry && {
            expiresDate: formatDate(after.expires.timestamp),
          }),
        },
      },
    },
  });
};
