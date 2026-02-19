/**
 * POST /test/schema - Test schema validation
 * Returns the resolved settings for testing purposes
 */
module.exports = async ({ assistant, user, settings }) => {
  assistant.log('test/schema: User subscription info', {
    subscriptionId: user.subscription?.product?.id,
    subscriptionStatus: user.subscription?.status,
    fullSubscription: user.subscription,
  });

  return assistant.respond({
    settings,
    user: {
      authenticated: user.authenticated,
      uid: user.auth?.uid || null,
      subscription: user.subscription?.product?.id || 'basic',
    },
  });
};
