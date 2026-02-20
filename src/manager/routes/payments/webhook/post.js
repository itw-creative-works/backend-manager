const path = require('path');
const powertools = require('node-powertools');

/**
 * POST /payments/webhook?processor=stripe&key=XXX
 * Receives payment processor webhooks, validates them, and saves to Firestore
 * The Firestore onWrite trigger handles async processing
 *
 * This handler is processor-agnostic. Each processor module defines:
 *   - parseWebhook(req) — extracts { eventId, eventType, raw, uid }
 *   - isSupported(eventType) — returns true for events we should process
 */
module.exports = async ({ assistant, Manager, libraries }) => {
  const { admin } = libraries;
  const data = assistant.request.data;
  const query = assistant.request.query;

  // Get processor and key from query params
  const processor = query.processor;
  const key = query.key;

  // Validate processor
  if (!processor) {
    return assistant.respond('Missing processor parameter', { code: 400 });
  }

  // Validate key against BACKEND_MANAGER_KEY
  if (!key || key !== process.env.BACKEND_MANAGER_KEY) {
    return assistant.respond('Invalid key', { code: 401 });
  }

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
  } catch (e) {
    return assistant.respond(`Unknown processor: ${processor}`, { code: 400 });
  }

  // Parse the webhook using the processor
  let parsed;
  try {
    parsed = processorModule.parseWebhook(assistant.ref.req);
  } catch (e) {
    return assistant.respond(`Failed to parse webhook: ${e.message}`, { code: 400 });
  }

  const { eventId, eventType, raw, uid } = parsed;

  assistant.log(`Parsed webhook: eventId=${eventId}, eventType=${eventType}, uid=${uid || 'null'}`);

  // Let the processor decide if this event type is relevant
  if (processorModule.isSupported && !processorModule.isSupported(eventType)) {
    assistant.log(`Ignoring event type: ${eventType}`);
    return assistant.respond({ received: true, ignored: true });
  }

  // Check for duplicate (skip if already processing/completed)
  const existingDoc = await admin.firestore().doc(`payments-webhooks/${eventId}`).get();
  if (existingDoc.exists) {
    const existingStatus = existingDoc.data()?.status;
    if (existingStatus !== 'failed') {
      assistant.log(`Duplicate webhook ${eventId}, existing status=${existingStatus}, skipping`);
      return assistant.respond({ received: true, duplicate: true });
    }
    assistant.log(`Retrying previously failed webhook ${eventId}`);
  }

  // Build timestamps
  const now = powertools.timestamp(new Date(), { output: 'string' });
  const nowUNIX = powertools.timestamp(now, { output: 'unix' });

  // Save to Firestore with status=pending (trigger handles the rest)
  await admin.firestore().doc(`payments-webhooks/${eventId}`).set({
    id: eventId,
    processor: processor,
    status: 'pending',
    raw: raw,
    uid: uid,
    event: {
      type: eventType,
    },
    error: null,
    metadata: {
      received: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
      processed: {
        timestamp: null,
        timestampUNIX: null,
      },
    },
  });

  assistant.log(`Saved payments-webhooks/${eventId}: eventType=${eventType}, processor=${processor}, uid=${uid}`);

  // Return 200 immediately
  return assistant.respond({ received: true });
};
