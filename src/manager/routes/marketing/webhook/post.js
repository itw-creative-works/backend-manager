/**
 * POST /marketing/webhook?provider=sendgrid|beehiiv&key=<BACKEND_MANAGER_WEBHOOK_KEY>
 *
 * Receives cross-provider unsubscribe webhooks (SendGrid + Beehiiv) and:
 *   1. Authenticates via ?key= query param (BACKEND_MANAGER_WEBHOOK_KEY env)
 *   2. Optionally rejects mismatched brand via ?brand= filter
 *   3. Loads the matching processor module from ./processors/{provider}.js
 *   4. Parses the webhook payload into one or more normalized events
 *   5. For each event: idempotency check via marketing-webhooks/{eventId}, then dispatch
 *   6. Returns 200 immediately so the provider doesn't retry
 *
 * Each processor module defines:
 *   - parseWebhook(req)   — returns Array<{ eventId, eventType, email, timestamp, raw, ... }>
 *   - isSupported(type)   — returns true if this event should be processed
 *   - handleEvent(ctx)    — does the work for one event (user doc + cross-provider sync)
 *
 * Mirrors the existing payments-webhook pattern. Processes events inline rather than
 * via a Firestore trigger — marketing webhooks are lower volume and lighter work than
 * payments, so the extra async layer isn't justified.
 */
const path = require('path');
const powertools = require('node-powertools');

module.exports = async ({ assistant, Manager, libraries }) => {
  const { admin } = libraries;
  const query = assistant.request.query;

  const provider = query.provider;
  const key = query.key;

  // Validate provider
  if (!provider) {
    return assistant.respond('Missing provider parameter', { code: 400 });
  }

  // Validate key against BACKEND_MANAGER_WEBHOOK_KEY (separate from BACKEND_MANAGER_KEY
  // so it can be rotated independently and scoped narrowly)
  if (!key || key !== process.env.BACKEND_MANAGER_WEBHOOK_KEY) {
    return assistant.respond('Invalid key', { code: 401 });
  }

  // Brand filter (defensive — mirror payments webhook pattern). If a brand is
  // specified and doesn't match ours, silently ignore. This lets one webhook
  // URL be shared across brands while each brand only processes its own events.
  const brand = query.brand;
  const ourBrand = Manager.config.brand?.id;
  if (brand && ourBrand && brand !== ourBrand) {
    assistant.log(`marketing webhook: brand mismatch (received=${brand}, expected=${ourBrand}), ignoring`);
    return assistant.respond({ received: true, ignored: true });
  }

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${provider}.js`));
  } catch (e) {
    assistant.error(`marketing webhook: failed to load processor "${provider}":`, e);
    return assistant.respond(`Unknown provider: ${provider}`, { code: 400 });
  }

  // Parse the webhook body into events
  let events;
  try {
    events = processorModule.parseWebhook(assistant.ref.req);
  } catch (e) {
    assistant.error(`marketing webhook: parse failed for ${provider}:`, e);
    return assistant.respond(`Failed to parse webhook: ${e.message}`, { code: 400 });
  }

  if (!Array.isArray(events) || events.length === 0) {
    assistant.log(`marketing webhook: ${provider} returned no events`);
    return assistant.respond({ received: true, processed: 0 });
  }

  assistant.log(`marketing webhook: ${provider} delivered ${events.length} event(s)`);

  // Process each event independently — one failure shouldn't block the others.
  // Use Promise.allSettled so we return success only after all events have been
  // attempted.
  const results = await Promise.allSettled(
    events.map((event) => processOneEvent({ Manager, assistant, admin, provider, event, processorModule }))
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value?.processed) processed++;
      else skipped++;
    } else {
      failed++;
      assistant.error('marketing webhook: event processing rejected:', r.reason);
    }
  }

  assistant.log(`marketing webhook: ${provider} complete — processed=${processed}, skipped=${skipped}, failed=${failed}`);

  return assistant.respond({ received: true, processed, skipped, failed });
};

/**
 * Process a single event end-to-end: idempotency check, support check, dispatch to handler.
 * Returns { processed: bool, skipped?: string, error?: any }.
 */
async function processOneEvent({ Manager, assistant, admin, provider, event, processorModule }) {
  const { eventId, eventType } = event;

  // No eventId means we can't dedupe — skip rather than risk double-processing
  if (!eventId) {
    assistant.log(`marketing webhook: ${provider} event missing eventId (type=${eventType}), skipping`);
    return { processed: false, skipped: 'missing-event-id' };
  }

  // Filter by supported event types
  if (processorModule.isSupported && !processorModule.isSupported(eventType)) {
    return { processed: false, skipped: 'unsupported-event-type' };
  }

  // Idempotency: skip if we've already processed this event
  const idempotencyRef = admin.firestore().doc(`marketing-webhooks/${eventId}`);
  const existingDoc = await idempotencyRef.get();

  if (existingDoc.exists) {
    const existingStatus = existingDoc.data()?.status;
    if (existingStatus !== 'failed') {
      assistant.log(`marketing webhook: ${provider} duplicate event ${eventId} (status=${existingStatus}), skipping`);
      return { processed: false, skipped: 'duplicate' };
    }
    assistant.log(`marketing webhook: ${provider} retrying previously failed event ${eventId}`);
  }

  // Build the audit doc
  const now = powertools.timestamp(new Date(), { output: 'string' });
  const nowUNIX = powertools.timestamp(now, { output: 'unix' });

  // Write 'pending' state before dispatching so concurrent deliveries see the lock
  await idempotencyRef.set({
    id: eventId,
    provider,
    status: 'pending',
    raw: event.raw || null,
    event: {
      type: eventType,
      email: event.email || null,
      timestamp: event.timestamp || null,
    },
    error: null,
    metadata: {
      created: { timestamp: now, timestampUNIX: nowUNIX },
      completed: { timestamp: null, timestampUNIX: null },
    },
  });

  // Dispatch to the processor's event handler
  let handlerResult;
  try {
    handlerResult = await processorModule.handleEvent({ Manager, assistant, parsed: event });

    // Mark completed
    await idempotencyRef.set({
      status: 'completed',
      result: handlerResult || null,
      metadata: {
        completed: { timestamp: powertools.timestamp(new Date(), { output: 'string' }), timestampUNIX: powertools.timestamp(new Date(), { output: 'unix' }) },
      },
    }, { merge: true });

    return { processed: true };
  } catch (e) {
    assistant.error(`marketing webhook: handler failed for ${provider} event ${eventId}:`, e);

    await idempotencyRef.set({
      status: 'failed',
      error: { message: e.message || String(e), stack: e.stack || null },
    }, { merge: true }).catch(() => {});

    return { processed: false, error: e };
  }
}
