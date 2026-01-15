/**
 * POST /test/usage - Test usage tracking
 * Increments the 'requests' usage metric and returns the updated usage data
 * Supports both authenticated (user doc) and unauthenticated (usage collection by IP) modes
 */
module.exports = async ({ assistant, user, settings }) => {
  const usage = assistant.usage;
  const amount = settings.amount;

  // Get usage before increment
  const beforePeriod = usage.getUsage('requests');
  const beforeTotal = user.usage?.requests?.total || 0;

  // Increment usage
  usage.increment('requests', amount);

  // Update usage in storage
  await usage.update();

  // Get usage after increment
  const afterPeriod = usage.getUsage('requests');
  const afterTotal = user.usage?.requests?.total || 0;

  // Log
  assistant.log(`test/usage: Incremented requests by ${amount}`, {
    authenticated: user.authenticated,
    key: usage.key,
    before: { period: beforePeriod, total: beforeTotal },
    after: { period: afterPeriod, total: afterTotal },
  });

  return assistant.respond({
    metric: 'requests',
    amount,
    authenticated: user.authenticated,
    key: usage.key,
    before: {
      period: beforePeriod,
      total: beforeTotal,
    },
    after: {
      period: afterPeriod,
      total: afterTotal,
    },
    user: {
      uid: user.auth?.uid || null,
      usage: user.usage,
    },
  });
};
