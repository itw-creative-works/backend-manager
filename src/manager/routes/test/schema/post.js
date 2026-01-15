/**
 * POST /test/schema - Test schema validation
 * Returns the resolved settings for testing purposes
 */
module.exports = async ({ assistant, user, settings }) => {
  assistant.log('test/schema: User plan info', {
    planId: user.plan?.id,
    planStatus: user.plan?.status,
    fullPlan: user.plan,
  });

  return assistant.respond({
    settings,
    user: {
      authenticated: user.authenticated,
      uid: user.auth?.uid || null,
      plan: user.plan?.id || 'basic',
    },
  });
};
