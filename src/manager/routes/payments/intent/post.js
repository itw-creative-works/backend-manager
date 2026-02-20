const path = require('path');
const powertools = require('node-powertools');

/**
 * POST /payments/intent
 * Creates a payment intent (e.g., Stripe Checkout Session) for subscription purchase
 * Requires authentication
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const uid = user.auth.uid;
  const processor = settings.processor;
  const productId = settings.productId;
  const frequency = settings.frequency;
  let trial = settings.trial;

  assistant.log(`Intent request: uid=${uid}, processor=${processor}, product=${productId}, frequency=${frequency}, trial=${trial}`);

  // Check if user already has an active non-basic subscription
  if (user.subscription?.status === 'active' && user.subscription?.product?.id !== 'basic') {
    assistant.log(`User ${uid} already has active subscription: product=${user.subscription.product.id}, status=${user.subscription.status}, resourceId=${user.subscription.payment?.resourceId}`);
    return assistant.respond('User already has an active subscription', { code: 400 });
  }

  // Resolve trial eligibility: if requested but user has subscription history, silently downgrade
  if (trial) {
    const historySnapshot = await admin.firestore()
      .collection('payments-subscriptions')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    if (!historySnapshot.empty) {
      assistant.log(`User ${uid} not eligible for trial (has subscription history), continuing without trial`);
      trial = false;
    }
  }

  // Validate product exists in config
  const product = (Manager.config.payment?.products || []).find(p => p.id === productId);
  if (!product) {
    assistant.log(`Product "${productId}" not found (available: ${(Manager.config.payment?.products || []).map(p => p.id).join(', ')})`);
    return assistant.respond(`Product '${productId}' not found`, { code: 400 });
  }

  assistant.log(`Product resolved: id=${product.id}, name=${product.name}, trialDays=${product.trial?.days || 'none'}`);

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
  } catch (e) {
    return assistant.respond(`Unknown processor: ${processor}`, { code: 400 });
  }

  // Create the intent via the processor
  let result;
  try {
    result = await processorModule.createIntent({
      uid,
      productId,
      frequency,
      trial,
      config: Manager.config,
      Manager,
      assistant,
    });
  } catch (e) {
    assistant.log(`Failed to create ${processor} intent: ${e.message}`);
    return assistant.respond(`Failed to create intent: ${e.message}`, { code: 500, sentry: true });
  }

  assistant.log(`${processor} intent created: id=${result.id}, url=${result.url}`);

  // Build timestamps
  const now = powertools.timestamp(new Date(), { output: 'string' });
  const nowUNIX = powertools.timestamp(now, { output: 'unix' });

  // Save to payments-intents collection
  await admin.firestore().doc(`payments-intents/${result.id}`).set({
    id: result.id,
    processor: processor,
    uid: uid,
    status: 'pending',
    productId: productId,
    frequency: frequency,
    trial: trial,
    raw: result.raw,
    metadata: {
      created: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
    },
  });

  assistant.log(`Saved payments-intents/${result.id}: uid=${uid}, product=${productId}, frequency=${frequency}, trial=${trial}`);

  return assistant.respond({
    id: result.id,
    url: result.url,
  });
};
