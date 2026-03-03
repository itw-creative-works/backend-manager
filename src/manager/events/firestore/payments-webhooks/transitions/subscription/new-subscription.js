/**
 * Transition: new-subscription
 * Triggered when a user subscribes for the first time (basic/null → active paid)
 * Check after.trial.claimed to determine if this is a trial subscription
 */
const { sendOrderEmail, formatDate } = require('../send-email.js');

module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  const isTrial = after.trial?.claimed === true;
  const brandName = assistant.Manager.config.brand?.name || '';
  const planName = after.product?.name || '';

  assistant.log(`Transition [subscription/new-subscription]: uid=${uid}, product=${after.product?.id}, frequency=${after.payment?.frequency}, trial=${isTrial}`);

  sendOrderEmail({
    template: 'main/order/confirmation',
    subject: `Your ${brandName} ${planName} order #${order?.id || ''}`,
    categories: ['order/confirmation'],
    userDoc,
    assistant,
    data: {
      order: {
        ...order,
        _computed: {
          date: formatDate(new Date().toISOString()),
          ...(isTrial && after.trial?.expires?.timestamp && {
            trialExpires: formatDate(after.trial.expires.timestamp),
          }),
        },
      },
    },
  });
};
