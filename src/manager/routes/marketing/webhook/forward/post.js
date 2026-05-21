/**
 * POST /marketing/webhook/forward?provider=sendgrid|beehiiv&key=<BACKEND_MANAGER_WEBHOOK_KEY>
 *
 * Parent-only forwarder. SendGrid and Beehiiv send webhooks to this single URL
 * on the parent BEM. The parent reads its `brands` collection and re-POSTs the
 * raw body to every child's /marketing/webhook?provider=X. Each child then
 * processes the event against its own Firestore and providers.
 *
 * Gating:
 *   - Only enabled when Manager.config.parent === 'self'. Any other value (a URL
 *     pointing TO the parent, the typical setup for child BEMs) returns 404.
 *   - Same BACKEND_MANAGER_WEBHOOK_KEY is shared across all brands, so the
 *     parent forwards the key it received (already validated) when calling
 *     each child.
 *
 * Brand URL derivation:
 *   - Each brand doc in the `brands` collection has `brand.url` (e.g. 'https://somiibo.com').
 *   - API URL is derived by inserting 'api.' subdomain: 'https://api.somiibo.com'.
 *   - Child receivers live at `/backend-manager/marketing/webhook` on that host.
 *
 * Self-inclusion:
 *   - The parent's own brand IS included in the fan-out. The parent BEM has
 *     its own user base (e.g. itwcreativeworks.com users) and needs the same
 *     consent updates as any other brand. Self-fan-out goes via HTTP like
 *     every other child — no special inline path.
 *
 * Failure isolation:
 *   - Each child POST is awaited via Promise.allSettled so one slow/down child
 *     doesn't block the others. Failures are logged but the overall request
 *     still returns 200 so the provider doesn't retry the parent indefinitely.
 *     Children themselves track idempotency, so provider retries are safe.
 */
const fetch = require('wonderful-fetch');

const CHILD_TIMEOUT_MS = 10000;

module.exports = async ({ assistant, Manager, libraries }) => {
  const { admin } = libraries;
  const query = assistant.request.query;

  // Gate: only the parent BEM exposes this route. Any brand whose config.parent
  // points to a URL (the normal case) returns 404 — pretend the route doesn't exist.
  if (!Manager.isParent()) {
    return assistant.respond('Not found', { code: 404 });
  }

  const provider = query.provider;
  const key = query.key;

  if (!provider) {
    return assistant.respond('Missing provider parameter', { code: 400 });
  }

  // Same key used for the receiver — parent validates incoming, then re-uses
  // it for outbound calls to children (all brands share this env value).
  if (!key || key !== process.env.BACKEND_MANAGER_WEBHOOK_KEY) {
    return assistant.respond('Invalid key', { code: 401 });
  }

  // Read the brands collection. This lives in the PARENT's Firestore.
  const snapshot = await admin.firestore().collection('brands').get()
    .catch((e) => {
      assistant.error('marketing webhook forward: failed to read brands collection:', e);
      return null;
    });

  if (!snapshot) {
    return assistant.respond('Failed to load brands', { code: 500 });
  }

  // Collect brand URLs from the docs
  const brands = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const brandUrl = data.brand?.url || null;
    const brandId = data.brand?.id || doc.id;

    if (!brandUrl) {
      assistant.log(`marketing webhook forward: brand ${brandId} has no brand.url, skipping`);
      return;
    }

    brands.push({ brandId, brandUrl });
  });

  if (brands.length === 0) {
    assistant.log('marketing webhook forward: no brands to forward to');
    return assistant.respond({ received: true, forwarded: 0 });
  }

  assistant.log(`marketing webhook forward: fanning out ${provider} event to ${brands.length} brand(s)`);

  // Forward the raw body to every child. assistant.ref.req.body holds the body
  // as we received it from the provider. We re-POST it without modification.
  const rawBody = assistant.ref.req?.body;

  const results = await Promise.allSettled(
    brands.map(({ brandId, brandUrl }) => forwardToChild({
      assistant,
      brandId,
      brandUrl,
      provider,
      key,
      body: rawBody,
    }))
  );

  let succeeded = 0;
  let failed = 0;
  const failures = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const brand = brands[i];
    if (r.status === 'fulfilled' && r.value?.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      const reason = r.status === 'rejected' ? r.reason?.message : (r.value?.error || 'unknown');
      failures.push({ brandId: brand.brandId, reason });
      assistant.error(`marketing webhook forward: ${brand.brandId} failed:`, reason);
    }
  }

  assistant.log(`marketing webhook forward: ${provider} complete — succeeded=${succeeded}, failed=${failed}`);

  // Always return 200 — child failures shouldn't make the provider retry the
  // parent. Each child tracks its own idempotency so safe to re-fan on retry.
  return assistant.respond({
    received: true,
    forwarded: brands.length,
    succeeded,
    failed,
    failures: failures.length > 0 ? failures : undefined,
  });
};

/**
 * POST the raw body to one child BEM's /marketing/webhook receiver.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
async function forwardToChild({ assistant, brandId, brandUrl, provider, key, body }) {
  // Derive API URL: brandUrl 'https://somiibo.com' → 'https://api.somiibo.com'.
  // Use URL parsing so we tolerate trailing slashes and unusual hosts.
  let apiUrl;
  try {
    const url = new URL(brandUrl);
    url.hostname = `api.${url.hostname}`;
    url.pathname = '/backend-manager/marketing/webhook';
    url.search = `?provider=${encodeURIComponent(provider)}&key=${encodeURIComponent(key)}`;
    apiUrl = url.toString();
  } catch (e) {
    return { ok: false, error: `Invalid brand URL "${brandUrl}": ${e.message}` };
  }

  try {
    const result = await fetch(apiUrl, {
      method: 'POST',
      response: 'json',
      timeout: CHILD_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assistant.log(`marketing webhook forward: ${brandId} OK — ${JSON.stringify(result)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
