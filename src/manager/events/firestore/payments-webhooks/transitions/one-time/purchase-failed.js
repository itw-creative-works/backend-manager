/**
 * Transition: purchase-failed
 * Triggered when a one-time payment fails (invoice.payment_failed with billing_reason=manual)
 *
 * NOTE: No email template exists for this transition yet. Keeping as stub.
 */
module.exports = async function ({ before, after, order, uid, userDoc, assistant }) {
  assistant.log(`Transition [one-time/purchase-failed]: uid=${uid}, orderId=${order?.id}`);

  // TODO: Send payment failure email once template is created
};
