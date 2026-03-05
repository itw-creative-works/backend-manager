/**
 * GET /payments/trial-eligibility
 * Returns whether the authenticated user is eligible for a free trial
 * Eligible = no previous subscription orders in payments-orders
 */
module.exports = async ({ assistant, user, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const uid = user.auth.uid;

  // Check for any previous subscription orders
  const historySnapshot = await admin.firestore()
    .collection('payments-orders')
    .where('owner', '==', uid)
    .where('type', '==', 'subscription')
    .limit(1)
    .get();

  const eligible = historySnapshot.empty;

  assistant.log(`Trial eligibility for ${uid}: ${eligible}`);

  return assistant.respond({ eligible });
};
