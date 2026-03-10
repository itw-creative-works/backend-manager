const path = require('path');
const powertools = require('node-powertools');

/**
 * POST /payments/dispute-alert?alerts=chargeblast&key=XXX
 * Receives dispute alert webhooks (e.g., from Chargeblast), validates them,
 * and saves to Firestore for async processing via onWrite trigger
 *
 * Query params:
 *   - alerts: alert provider name (default: 'chargeblast')
 *   - key: must match BACKEND_MANAGER_KEY
 */
module.exports = async ({ assistant, Manager, libraries }) => {
  const { admin } = libraries;
  const body = assistant.request.body;
  const query = assistant.request.query;

  // Validate key against BACKEND_MANAGER_KEY
  const key = query.key;
  if (!key || key !== process.env.BACKEND_MANAGER_KEY) {
    return assistant.respond('Invalid key', { code: 401 });
  }

  // Determine alert provider (default: chargeblast)
  const provider = query.alerts || 'chargeblast';

  // Load the processor module
  let processorModule;
  try {
    processorModule = require(path.resolve(__dirname, `processors/${provider}.js`));
  } catch (e) {
    return assistant.respond(`Unknown alert provider: ${provider}`, { code: 400 });
  }

  // Normalize the payload using the processor
  let alert;
  try {
    alert = processorModule.normalize(body);
  } catch (e) {
    return assistant.respond(`Failed to normalize alert: ${e.message}`, { code: 400 });
  }

  const alertId = alert.id;

  assistant.log(`Parsed dispute alert: id=${alertId}, provider=${provider}, processor=${alert.processor}, amount=${alert.amount}, card=****${alert.card.last4}`);

  // Check for duplicate (skip if already processing/completed)
  const existingDoc = await admin.firestore().doc(`payments-disputes/${alertId}`).get();
  if (existingDoc.exists) {
    const existingStatus = existingDoc.data()?.status;
    if (existingStatus !== 'failed') {
      assistant.log(`Duplicate dispute alert ${alertId}, existing status=${existingStatus}, skipping`);
      return assistant.respond({ received: true, duplicate: true });
    }
    assistant.log(`Retrying previously failed dispute alert ${alertId}`);
  }

  // Build timestamps
  const now = powertools.timestamp(new Date(), { output: 'string' });
  const nowUNIX = powertools.timestamp(now, { output: 'unix' });

  // Save to Firestore with status=pending (trigger handles the rest)
  await admin.firestore().doc(`payments-disputes/${alertId}`).set({
    id: alertId,
    provider: provider,
    status: 'pending',
    alert: alert,
    match: null,
    actions: {
      refund: 'pending',
      cancel: 'pending',
      email: 'pending',
    },
    errors: [],
    error: null,
    metadata: {
      created: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
      completed: {
        timestamp: null,
        timestampUNIX: null,
      },
    },
    raw: body,
  });

  assistant.log(`Saved payments-disputes/${alertId}: provider=${provider}, processor=${alert.processor}`);

  // Return 200 immediately — async processing via Firestore trigger
  return assistant.respond({ received: true });
};
