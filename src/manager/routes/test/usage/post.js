/**
 * POST /test/usage - Test usage tracking
 * Increments the 'requests' usage metric and returns the updated usage data
 * Supports both authenticated (user doc) and unauthenticated (usage collection by IP) modes
 */
module.exports = async ({ assistant, user, settings }) => {
  const usage = assistant.usage;
  const amount = settings.amount;

  // Get usage before increment
  const beforeMonthly = usage.getUsage('requests');
  const beforeTotal = user.usage?.requests?.total || 0;
  const beforeDaily = user.usage?.requests?.daily || 0;

  // Increment usage
  usage.increment('requests', amount);

  // Update usage in storage
  await usage.update();

  // Get usage after increment
  const afterMonthly = usage.getUsage('requests');
  const afterTotal = user.usage?.requests?.total || 0;
  const afterDaily = user.usage?.requests?.daily || 0;

  // Log
  assistant.log(`test/usage: Incremented requests by ${amount}`, {
    authenticated: user.authenticated,
    key: usage.key,
    before: { monthly: beforeMonthly, daily: beforeDaily, total: beforeTotal },
    after: { monthly: afterMonthly, daily: afterDaily, total: afterTotal },
  });

  return assistant.respond({
    metric: 'requests',
    amount,
    authenticated: user.authenticated,
    key: usage.key,
    before: {
      monthly: beforeMonthly,
      daily: beforeDaily,
      total: beforeTotal,
    },
    after: {
      monthly: afterMonthly,
      daily: afterDaily,
      total: afterTotal,
    },
    user: {
      uid: user.auth?.uid || null,
      usage: user.usage,
    },
  });
};
