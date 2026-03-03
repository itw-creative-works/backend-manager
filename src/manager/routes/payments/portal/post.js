const path = require('path');

/**
 * POST /payments/portal
 * Creates a Stripe Billing Portal session for the authenticated user.
 * The portal allows managing payment methods and viewing invoices,
 * but does NOT allow cancellation (users must use POST /payments/cancel).
 * Requires authentication.
 */
module.exports = async ({ assistant, user, settings }) => {
  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const uid = user.auth.uid;
  const returnUrl = settings.returnUrl;
  const subscription = user.subscription;

  // Require a paid subscription (any status — suspended users can still manage billing)
  if (!subscription || subscription.product?.id === 'basic') {
    assistant.log(`Portal rejected: uid=${uid}, product=${subscription?.product?.id}`);
    return assistant.respond('No paid subscription found', { code: 400 });
  }

  const processor = subscription.payment?.processor;

  if (!processor) {
    assistant.log(`Portal rejected: uid=${uid}, no processor set`);
    return assistant.respond('Subscription payment processor not found', { code: 400 });
  }

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
  } catch (e) {
    return assistant.respond(`Unknown processor: ${processor}`, { code: 400 });
  }

  // Create the portal session via the processor
  const email = user.auth?.email || null;
  let result;
  try {
    result = await processorModule.createPortalSession({ uid, email, returnUrl, assistant });
  } catch (e) {
    assistant.log(`Failed to create ${processor} portal session: ${e.message}`);
    return assistant.respond(`Failed to create portal session: ${e.message}`, { code: 500, sentry: true });
  }

  assistant.log(`Portal session created: uid=${uid}, processor=${processor}`);

  return assistant.respond({ url: result.url });
};
