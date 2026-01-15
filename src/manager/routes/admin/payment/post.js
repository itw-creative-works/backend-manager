/**
 * POST /admin/payment - Payment processor webhook
 * Admin-only endpoint to process payment events
 */
const jetpack = require('fs-jetpack');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for productId in payload
  const productId = settings?.payload?.details?.productIdGlobal;
  if (!productId) {
    return assistant.respond('No productId', { code: 400 });
  }

  const processorPath = `${Manager.cwd}/payment-processors/${productId}.js`;

  assistant.log('Loading payment processor:', processorPath);

  // Check if processor exists
  if (!jetpack.exists(processorPath)) {
    assistant.warn('Subprocessor does not exist:', processorPath);
    return assistant.respond({});
  }

  // Load processor
  let processor;
  try {
    processor = new (require(processorPath));
    processor.Manager = Manager;
  } catch (e) {
    assistant.error('Subprocessor failed to load:', processorPath, e);
    return assistant.respond({});
  }

  // Process payment
  const result = await processor.process(settings).catch(e => e);

  if (result instanceof Error) {
    return assistant.respond(`Payment processor @ "${processorPath}" failed: ${result}`, { code: 500, sentry: true });
  }

  // Track analytics
  assistant.analytics.event('admin/payment', { productId: productId });

  return assistant.respond(result);
};
