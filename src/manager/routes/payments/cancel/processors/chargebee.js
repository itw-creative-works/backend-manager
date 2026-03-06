/**
 * Chargebee cancel processor
 * Cancels a subscription — immediately if trialing, at period end otherwise.
 *
 * Chargebee cancel_option:
 * - 'end_of_term': Sets status to non_renewing (cancel at period end)
 * - 'immediately': Cancels right away (status → cancelled)
 */
module.exports = {
  /**
   * Cancel a Chargebee subscription
   *
   * @param {object} options
   * @param {string} options.resourceId - Chargebee subscription ID
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.subscription - User's current subscription object
   * @param {object} options.assistant - Assistant instance for logging
   */
  async cancelAtPeriodEnd({ resourceId, uid, subscription, assistant }) {
    const ChargebeeLib = require('../../../../libraries/payment/processors/chargebee.js');
    ChargebeeLib.init();

    const isTrialing = subscription?.trial?.claimed
      && subscription?.status === 'active'
      && subscription?.trial?.expires?.timestampUNIX === subscription?.expires?.timestampUNIX;

    if (isTrialing) {
      // Immediate cancel for trials
      await ChargebeeLib.request(`/subscriptions/${resourceId}/cancel_for_items`, {
        method: 'POST',
        body: { cancel_option: 'immediately' },
      });
      assistant.log(`Chargebee cancel immediate (trialing): sub=${resourceId}, uid=${uid}`);
    } else {
      // Cancel at end of billing period
      await ChargebeeLib.request(`/subscriptions/${resourceId}/cancel_for_items`, {
        method: 'POST',
        body: { cancel_option: 'end_of_term' },
      });
      assistant.log(`Chargebee cancel at period end: sub=${resourceId}, uid=${uid}`);
    }
  },
};
