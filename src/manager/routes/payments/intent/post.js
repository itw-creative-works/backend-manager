const path = require('path');
const powertools = require('node-powertools');
const OrderId = require('../../../libraries/payment/order-id.js');

/**
 * POST /payments/intent
 * Creates a payment intent (e.g., Stripe Checkout Session) for subscription or one-time purchase
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

  // Validate product exists in config
  const product = (Manager.config.payment?.products || []).find(p => p.id === productId);
  if (!product) {
    assistant.log(`Product "${productId}" not found (available: ${(Manager.config.payment?.products || []).map(p => p.id).join(', ')})`);
    return assistant.respond(`Product '${productId}' not found`, { code: 400 });
  }

  const productType = product.type || 'subscription';

  assistant.log(`Product resolved: id=${product.id}, name=${product.name}, type=${productType}, trialDays=${product.trial?.days || 'none'}`);

  // Subscription-specific guards
  if (productType === 'subscription') {
    // Require frequency for subscriptions
    if (!frequency) {
      return assistant.respond('Frequency is required for subscription products', { code: 400 });
    }

    // Check if user already has an active non-basic subscription
    if (user.subscription?.status === 'active' && user.subscription?.product?.id !== 'basic') {
      assistant.log(`User ${uid} already has active subscription: product=${user.subscription.product.id}, status=${user.subscription.status}, resourceId=${user.subscription.payment?.resourceId}`);
      return assistant.respond('User already has an active subscription', { code: 400 });
    }

    // Resolve trial eligibility: if requested but user has subscription history, silently downgrade
    if (trial) {
      const historySnapshot = await admin.firestore()
        .collection('payments-orders')
        .where('owner', '==', uid)
        .where('type', '==', 'subscription')
        .limit(1)
        .get();

      if (!historySnapshot.empty) {
        assistant.log(`User ${uid} not eligible for trial (has subscription history), continuing without trial`);
        trial = false;
      }
    }
  } else {
    // One-time purchases don't use trial or frequency
    trial = false;
  }

  // Generate order ID
  const orderId = OrderId.generate();

  assistant.log(`Generated orderId=${orderId}`);

  // Build redirect URLs
  const confirmationUrl = buildConfirmationUrl(Manager.project.websiteUrl, { product, productId, productType, frequency, processor, trial, orderId });
  const cancelUrl = buildCancelUrl(Manager.project.websiteUrl, { productId, frequency });

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
      orderId,
      product,
      productId,
      frequency,
      trial,
      confirmationUrl,
      cancelUrl,
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

  // Save to payments-intents collection (keyed by orderId for consistent lookup with payments-orders)
  await admin.firestore().doc(`payments-intents/${orderId}`).set({
    id: orderId,
    intentId: result.id,
    processor: processor,
    owner: uid,
    status: 'pending',
    productId: productId,
    type: productType,
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

  assistant.log(`Saved payments-intents/${orderId}: uid=${uid}, product=${productId}, type=${productType}, frequency=${frequency}, trial=${trial}`);

  return assistant.respond({
    id: result.id,
    orderId: orderId,
    url: result.url,
  });
};

/**
 * Build the confirmation/success redirect URL
 */
function buildConfirmationUrl(baseUrl, { product, productId, productType, frequency, processor, trial, orderId }) {
  const amount = productType === 'subscription'
    ? (product.prices?.[frequency] || 0)
    : (product.prices?.once || 0);

  const url = new URL('/payment/confirmation', baseUrl);
  url.searchParams.set('productId', productId);
  url.searchParams.set('productName', product.name || productId);
  url.searchParams.set('amount', trial && product.trial?.days ? '0' : String(amount));
  url.searchParams.set('currency', 'USD');
  url.searchParams.set('frequency', frequency || 'once');
  url.searchParams.set('paymentMethod', processor);
  url.searchParams.set('trial', String(!!trial && !!product.trial?.days));
  url.searchParams.set('orderId', orderId);
  url.searchParams.set('track', 'true');

  return url.toString();
}

/**
 * Build the cancel/back redirect URL
 */
function buildCancelUrl(baseUrl, { productId, frequency }) {
  const url = new URL('/payment/checkout', baseUrl);
  url.searchParams.set('product', productId);

  if (frequency) {
    url.searchParams.set('frequency', frequency);
  }

  url.searchParams.set('payment', 'cancelled');

  return url.toString();
}
