/**
 * SendGrid webhook processor
 *
 * SendGrid sends an array of events per POST. This module parses the array,
 * decides which events represent an unsubscribe (revocation of marketing consent),
 * and exposes a per-event handler that:
 *   1. Looks up the user by email in this brand's Firestore (silent skip if not found)
 *   2. Writes consent.marketing.status = 'revoked' to the user doc, source: 'sendgrid'
 *   3. Calls Beehiiv to remove the contact too (cross-provider sync — idempotent on 404)
 *
 * Supported event types (anything else is silently ignored):
 *   - 'unsubscribe'         — user clicked the unified unsubscribe link
 *   - 'group_unsubscribe'   — user unsubscribed from a specific ASM group
 *   - 'spamreport'          — user marked email as spam
 *   - 'bounce'              — ONLY when bounce_classification is 'Invalid Address' (hard bounce).
 *                              Technical bounces (DMARC, TLS, DNS) are sender-side issues and
 *                              should NOT revoke the recipient's consent.
 *   - 'dropped'             — ONLY when bounce_classification is 'Invalid Address'.
 *
 * Note: 'group_unsubscribe' is the most common one (matches our ASM-link flow), and since
 * GROUPS.marketing (25928) is account-global across all brands, an unsub from group 25928
 * legitimately removes the user from marketing across the entire SendGrid account.
 *
 * No idempotency ledger — the revoke + cross-provider remove are idempotent, so a
 * provider retry re-runs safely with the same end state.
 */

const REVOKE_EVENT_TYPES = new Set([
  'unsubscribe',
  'group_unsubscribe',
  'spamreport',
]);

// Bounce events only revoke consent when the bounce_classification indicates
// the mailbox genuinely doesn't exist. Technical bounces (DMARC, TLS, DNS),
// reputation bounces, content blocks, and temporary failures are the SENDER's
// problem — the recipient's email is still valid.
const HARD_BOUNCE_CLASSIFICATIONS = new Set([
  'Invalid Address',
]);

/**
 * Parse the raw webhook request into a normalized array of events.
 * SendGrid sends an array of events as the body. Some HTTP clients (including
 * BEM's own test client) JSON-encode arrays as objects with numeric keys —
 * we tolerate both shapes plus the rare single-event object form.
 */
function parseWebhook(req) {
  const body = req.body;

  if (!body) {
    throw new Error('Empty webhook body');
  }

  let events;
  if (Array.isArray(body)) {
    // Real SendGrid: array body
    events = body;
  } else if (body && typeof body === 'object' && typeof body['0'] === 'object' && body['0'] !== null) {
    // Array serialized as object-with-numeric-keys (test clients, some proxies)
    events = [];
    let i = 0;
    while (body[String(i)]) {
      events.push(body[String(i)]);
      i += 1;
    }
  } else {
    // Single event sent as a bare object
    events = [body];
  }

  return events.map((event) => {
    // sg_event_id is SendGrid's per-event unique ID, retained for log context.
    // smtp-id is another stable identifier we fall back to.
    const eventId = event.sg_event_id || event['smtp-id'] || event.smtpId || null;
    const eventType = event.event;
    const email = typeof event.email === 'string' ? event.email.trim().toLowerCase() : null;
    const timestamp = typeof event.timestamp === 'number' ? event.timestamp : null;
    const asmGroupId = event.asm_group_id || null;
    const bounceClassification = event.bounce_classification || null;

    return {
      eventId,
      eventType,
      email,
      timestamp,
      asmGroupId,
      bounceClassification,
      raw: event,
    };
  });
}

/**
 * Returns true if this parsed event represents a revocation we should act on.
 * For bounce/dropped events, only hard bounces (Invalid Address) qualify.
 */
function isSupported(parsed) {
  const { eventType, bounceClassification } = parsed;

  if (REVOKE_EVENT_TYPES.has(eventType)) {
    return true;
  }

  if (eventType === 'bounce' || eventType === 'dropped') {
    return HARD_BOUNCE_CLASSIFICATIONS.has(bounceClassification);
  }

  return false;
}

/**
 * Process a single parsed event. Called by the dispatcher for each supported event.
 *
 * Returns a result object summarizing what happened (for logging/response).
 */
async function handleEvent({ Manager, assistant, parsed }) {
  const { admin } = Manager.libraries;
  const { eventId, eventType, email, timestamp } = parsed;

  if (!email) {
    assistant.log(`sendgrid webhook: event ${eventId} (${eventType}) missing email, skipping`);
    return { handled: false, reason: 'missing-email' };
  }

  // Convert SendGrid's UNIX timestamp to our canonical { timestamp, timestampUNIX } shape.
  // Fall back to server time if missing.
  const startTime = assistant.meta.startTime;
  const eventUNIX = typeof timestamp === 'number' ? timestamp : startTime.timestampUNIX;
  const eventISO = new Date(eventUNIX * 1000).toISOString();

  // Look up the user by email
  const snapshot = await admin.firestore().collection('users')
    .where('auth.email', '==', email)
    .limit(1)
    .get()
    .catch((e) => {
      assistant.error(`sendgrid webhook: user lookup failed for ${email}:`, e);
      return null;
    });

  if (!snapshot || snapshot.empty) {
    // Silent skip — this email may not map to a customer of THIS brand (shared SendGrid account).
    assistant.log(`sendgrid webhook: no user found for ${email}, skipping doc update`);
    return { handled: false, reason: 'user-not-found', email };
  }

  const userDoc = snapshot.docs[0];
  const uid = userDoc.id;

  // Write consent.marketing.status = 'revoked' (preserve grantedAt — informational audit trail)
  await admin.firestore().doc(`users/${uid}`).set({
    consent: {
      marketing: {
        status: 'revoked',
        revokedAt: {
          timestamp: eventISO,
          timestampUNIX: eventUNIX,
          source: 'sendgrid',
          ip: null,
          text: null,
        },
      },
    },
    metadata: Manager.Metadata().set({ tag: 'marketing/webhook:sendgrid' }),
  }, { merge: true });

  assistant.log(`sendgrid webhook: revoked consent.marketing for ${uid} (${email}) — eventType=${eventType}`);

  // Cross-provider sync: also remove from Beehiiv (best-effort, idempotent on 404)
  const shouldCallExternalAPIs = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (shouldCallExternalAPIs) {
    try {
      const mailer = Manager.Email(assistant);
      await mailer.remove(email);
      assistant.log(`sendgrid webhook: cross-provider sync complete for ${email}`);
    } catch (e) {
      // Best-effort — user doc is already updated. Log + continue.
      assistant.error(`sendgrid webhook: cross-provider sync failed for ${email}:`, e);
    }
  } else {
    assistant.log('sendgrid webhook: skipping cross-provider sync (BEM_TESTING=true)');
  }

  return { handled: true, uid, email, eventType };
}

module.exports = {
  parseWebhook,
  isSupported,
  handleEvent,
};
