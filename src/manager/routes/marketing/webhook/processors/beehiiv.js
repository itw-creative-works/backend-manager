/**
 * Beehiiv webhook processor
 *
 * Beehiiv sends one event per POST (unlike SendGrid's batched array).
 * Each event includes a `publication_id` so the processor can decide whether
 * the event belongs to THIS brand or a sibling brand sharing the same parent.
 *
 * Supported event types (anything else is silently ignored):
 *   - 'subscription.unsubscribed' — user clicked unsubscribe in a Beehiiv email
 *   - 'subscription.deleted'      — admin or API removed the subscriber
 *   - 'subscription.paused'       — user paused delivery (treat as revoke; we
 *                                    can't differentiate "pause" semantics)
 *
 * Publication routing:
 *   - If the event's publication_id doesn't match this brand's configured
 *     publication, silent skip. This is how the shared-devbeans publication
 *     case works: the parent fans the event to every child, and only the
 *     brand(s) sharing that publication actually process it.
 *   - getPublicationId() reads from config.marketing.newsletter.publicationId
 *     or fuzzy-matches by brand name against the Beehiiv API.
 *
 * No idempotency ledger — the revoke + cross-provider remove are idempotent, so a
 * provider retry re-runs safely with the same end state.
 */

const REVOKE_EVENT_TYPES = new Set([
  'subscription.unsubscribed',
  'subscription.deleted',
  'subscription.paused',
]);

/**
 * Parse the raw webhook request into a normalized array (single-element).
 * Beehiiv sends one event per POST. Some HTTP clients serialize objects with
 * extra keys merged in (e.g. our test client merges query params into the body) —
 * we tolerate that by pulling fields explicitly.
 */
function parseWebhook(req) {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    throw new Error('Empty or non-object webhook body');
  }

  // Beehiiv's event ID lives at `data.id` (per their docs) but their actual
  // delivery shape can vary across endpoints. Try common locations.
  const eventId = body.id
    || body.event_id
    || body.data?.id
    || null;

  const eventType = body.event || body.type || null;

  // Email may be at top-level or nested under `data`
  const rawEmail = body.email || body.data?.email || null;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : null;

  // Publication ID — required to decide whether THIS brand should handle it
  const publicationId = body.publication_id || body.data?.publication_id || null;

  // Timestamp — Beehiiv uses ISO 8601. Fall back to data.created_at variants.
  const timestampISO = body.created_at
    || body.timestamp
    || body.data?.created_at
    || null;

  const timestampUNIX = timestampISO
    ? Math.floor(new Date(timestampISO).getTime() / 1000) || null
    : null;

  return [{
    eventId,
    eventType,
    email,
    timestamp: timestampUNIX,
    publicationId,
    raw: body,
  }];
}

/**
 * Returns true if this event type represents a revocation we should act on.
 */
function isSupported(eventType) {
  return REVOKE_EVENT_TYPES.has(eventType);
}

/**
 * Process a single parsed event. Called by the dispatcher for each supported event.
 * Returns a result object summarizing what happened.
 */
async function handleEvent({ Manager, assistant, parsed }) {
  const { admin } = Manager.libraries;
  const { eventId, eventType, email, timestamp, publicationId } = parsed;

  if (!email) {
    assistant.log(`beehiiv webhook: event ${eventId} (${eventType}) missing email, skipping`);
    return { handled: false, reason: 'missing-email' };
  }

  // Publication filter — silent skip if the event isn't for our publication.
  // This is THE mechanism that routes shared-publication events (e.g. devbeans
  // across 6 brands) to only the brands that share that publication.
  // beehiivProvider.getPublicationId() reads Manager.config.marketing.newsletter.publicationId
  // first, then falls back to fuzzy-match against the Beehiiv API by brand name.
  if (publicationId) {
    let ourPublicationId = null;
    try {
      const beehiivProvider = require('../../../../libraries/email/providers/beehiiv.js');
      if (typeof beehiivProvider.getPublicationId === 'function') {
        ourPublicationId = await beehiivProvider.getPublicationId();
      }
    } catch (e) {
      assistant.error('beehiiv webhook: failed to resolve our publication ID:', e);
      return { handled: false, reason: 'publication-resolve-failed' };
    }

    if (!ourPublicationId) {
      assistant.log(`beehiiv webhook: no publication configured for this brand, skipping event ${eventId}`);
      return { handled: false, reason: 'no-local-publication' };
    }

    if (ourPublicationId !== publicationId) {
      assistant.log(`beehiiv webhook: publication mismatch (event=${publicationId}, ours=${ourPublicationId}), skipping`);
      return { handled: false, reason: 'publication-mismatch' };
    }
  }

  // Build the canonical revokedAt timestamp from the event (or server time if missing)
  const startTime = assistant.meta.startTime;
  const eventUNIX = typeof timestamp === 'number' ? timestamp : startTime.timestampUNIX;
  const eventISO = new Date(eventUNIX * 1000).toISOString();

  // Look up the user by email
  const snapshot = await admin.firestore().collection('users')
    .where('auth.email', '==', email)
    .limit(1)
    .get()
    .catch((e) => {
      assistant.error(`beehiiv webhook: user lookup failed for ${email}:`, e);
      return null;
    });

  if (!snapshot || snapshot.empty) {
    // Silent skip — this email may not map to a customer of THIS brand even if
    // the publication matched (legitimate for shared-devbeans where 6 brands
    // process every event but only one has the user).
    assistant.log(`beehiiv webhook: no user found for ${email}, skipping doc update`);
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
          source: 'beehiiv',
          ip: null,
          text: null,
        },
      },
    },
    metadata: Manager.Metadata().set({ tag: 'marketing/webhook:beehiiv' }),
  }, { merge: true });

  assistant.log(`beehiiv webhook: revoked consent.marketing for ${uid} (${email}) — eventType=${eventType}`);

  // Cross-provider sync: also remove from SendGrid (best-effort, idempotent on 404)
  const shouldCallExternalAPIs = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (shouldCallExternalAPIs) {
    try {
      const mailer = Manager.Email(assistant);
      await mailer.remove(email);
      assistant.log(`beehiiv webhook: cross-provider sync complete for ${email}`);
    } catch (e) {
      // Best-effort — user doc is already updated. Log + continue.
      assistant.error(`beehiiv webhook: cross-provider sync failed for ${email}:`, e);
    }
  } else {
    assistant.log('beehiiv webhook: skipping cross-provider sync (BEM_TESTING=true)');
  }

  return { handled: true, uid, email, eventType };
}

module.exports = {
  parseWebhook,
  isSupported,
  handleEvent,
};
