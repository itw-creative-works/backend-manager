# TODO: Payment Webhook Key Upgrade — `BACKEND_MANAGER_KEY` → `BACKEND_MANAGER_WEBHOOK_KEY`

## Context

In BEM v5.2.0 we introduced `BACKEND_MANAGER_WEBHOOK_KEY` as a dedicated env var for third-party webhook authentication, scoped narrowly so it can be rotated independently of the admin key. The marketing routes (`/marketing/webhook`, `/marketing/webhook/forward`) use it correctly.

The **payment webhook** (`/payments/webhook`) and **dispute-alert webhook** (`/payments/dispute-alert`) still validate against `BACKEND_MANAGER_KEY` — the general-purpose admin key. This is a security misalignment: a leaked admin key could forge payment webhooks, and rotating the admin key forces every Stripe/PayPal/Chargebee webhook URL to be re-registered.

Plan: gradual rollout. Phase 1 (this BEM release) makes the payment routes accept **either** key so existing brand deploys (with only `BACKEND_MANAGER_KEY` set) keep working AND new brands can start using `BACKEND_MANAGER_WEBHOOK_KEY` immediately. Phase 2 (a later BEM release) drops the legacy fallback after every brand has been migrated.

## Files needing the dual-key check

| File | Line | Current |
|---|---|---|
| [src/manager/routes/payments/webhook/post.js](src/manager/routes/payments/webhook/post.js) | 28 | `if (!key \|\| key !== process.env.BACKEND_MANAGER_KEY)` |
| [src/manager/routes/payments/dispute-alert/post.js](src/manager/routes/payments/dispute-alert/post.js) | 20 | `if (!key \|\| key !== process.env.BACKEND_MANAGER_KEY)` |
| [src/manager/routes/payments/intent/processors/test.js](src/manager/routes/payments/intent/processors/test.js) | 158 | `key=${process.env.BACKEND_MANAGER_KEY}` |

## Phase 1 — Dual-key acceptance (this BEM release)

### Validation change (webhook + dispute-alert)

Replace the single-key check with a dual-key check. Accept the request if `key` matches EITHER `BACKEND_MANAGER_WEBHOOK_KEY` OR the legacy `BACKEND_MANAGER_KEY`.

```js
// Before
if (!key || key !== process.env.BACKEND_MANAGER_KEY) {
  return assistant.respond('Invalid key', { code: 401 });
}

// After (Phase 1 — dual-key fallback)
const validKeys = [
  process.env.BACKEND_MANAGER_WEBHOOK_KEY,
  process.env.BACKEND_MANAGER_KEY, // legacy — remove in Phase 2
].filter(Boolean);

if (!key || !validKeys.includes(key)) {
  return assistant.respond('Invalid key', { code: 401 });
}
```

Notes:
- `.filter(Boolean)` matters — if a brand hasn't set `BACKEND_MANAGER_WEBHOOK_KEY` yet, `validKeys` becomes `[BACKEND_MANAGER_KEY]` (single-element). If a brand HAS set it, both are accepted.
- If BOTH env vars are unset (misconfigured brand), `validKeys` is `[]` and every request 401s. That's the right behavior — explicit failure beats silent acceptance.
- Update the route header comments (lines 11 and 27 of dispute-alert, 27 of webhook) to mention both keys.

### Test processor self-fire URL

Switch [src/manager/routes/payments/intent/processors/test.js:158](src/manager/routes/payments/intent/processors/test.js#L158) to PREFER `BACKEND_MANAGER_WEBHOOK_KEY` and fall back to `BACKEND_MANAGER_KEY`:

```js
const webhookKey = process.env.BACKEND_MANAGER_WEBHOOK_KEY || process.env.BACKEND_MANAGER_KEY;
const webhookUrl = `${assistant.Manager.project.apiUrl}/backend-manager/payments/webhook?processor=test&key=${webhookKey}`;
```

This way the test processor exercises the new key when it's set, and falls back to the legacy key on brands that haven't migrated yet.

### Test infrastructure updates

**`src/test/utils/http-client.js`** — add `backendManagerWebhookKey` field alongside the existing `backendManagerKey`.

**`src/test/runner.js`** — thread `backendManagerWebhookKey` through the runner context the same way `backendManagerKey` is threaded today (3 sites).

**`src/cli/commands/test.js`** — read `BACKEND_MANAGER_WEBHOOK_KEY` from env (parallel to the existing `BACKEND_MANAGER_KEY` read), pass it through to the runner, fall back to the admin key if unset.

**Route + journey tests** — update test fixtures to prefer `BACKEND_MANAGER_WEBHOOK_KEY` when set:
- `test/routes/payments/webhook.js` — all `${config.backendManagerKey}` interpolations in `payments/webhook?...&key=` URLs
- `test/routes/payments/dispute-alert.js` — same (13 sites)
- `test/events/payments/journey-*.js` — only the `payments/webhook?...&key=` URLs (NOT the admin-auth uses elsewhere in journey tests)

Use `config.backendManagerWebhookKey || config.backendManagerKey` everywhere so both keys are exercised.

### Docs

- **`docs/stripe-webhook-forwarding.md`** — line 7 + 18 — note the dual-key acceptance, recommend `BACKEND_MANAGER_WEBHOOK_KEY` for new setups, note legacy `BACKEND_MANAGER_KEY` is still accepted for backwards compatibility.
- **`CHANGELOG.md`** — entry under the next version. Categorize under `Changed` (NOT `BREAKING` — that's reserved for Phase 2). Spell out: "Payment webhook + dispute-alert routes now accept either `BACKEND_MANAGER_WEBHOOK_KEY` (preferred) or `BACKEND_MANAGER_KEY` (legacy). Set `BACKEND_MANAGER_WEBHOOK_KEY` in every consumer brand's `.env` and run OMEGA payment ensure before Phase 2 ships."
- **`templates/_.env`** — already declares both keys, no change.

### Verification (manual)

1. **Local test (no `BACKEND_MANAGER_WEBHOOK_KEY` set)** — confirm legacy fallback still passes:
   ```bash
   npx mgr test routes/payments/webhook routes/payments/dispute-alert events/payments
   ```
   Expect green.

2. **Local test (`BACKEND_MANAGER_WEBHOOK_KEY` set to a different value)** — confirm the new key is accepted AND the legacy key still works:
   ```bash
   BACKEND_MANAGER_WEBHOOK_KEY=test-webhook-key npx mgr test routes/payments/webhook routes/payments/dispute-alert events/payments
   ```
   Expect green.

3. **Live spot-check on one brand (Somiibo)** — deploy this BEM release to Somiibo (whose `.env` currently only has `BACKEND_MANAGER_KEY` set OR has both), trigger a Stripe test event, confirm the webhook doc lands in Firestore.

## Phase 2 — Drop legacy fallback (future BEM release)

**Do NOT do this until every consumer brand has been migrated and verified.** Tracking checklist for migration readiness:

- [ ] Every consumer `.env` has `BACKEND_MANAGER_WEBHOOK_KEY` set (spot-check via OMEGA across all brands)
- [ ] OMEGA `payment/ensure/{stripe,paypal,chargebee}-webhook.js` updated to use `BACKEND_MANAGER_WEBHOOK_KEY` when constructing webhook URLs (see "OMEGA changes" below)
- [ ] OMEGA `--service payment` run across every brand to re-register webhook URLs at Stripe/PayPal/Chargebee with the new key
- [ ] Stale webhook URLs (the old ones with `key=BACKEND_MANAGER_KEY`) deleted from each provider — these will start 401-ing the moment Phase 2 ships
- [ ] At least one live billing cycle (Stripe charge, refund, dispute) observed working end-to-end on the new key for at least 3 brands

When all boxes are checked, Phase 2 ships as a **breaking change**:

```js
// Phase 2 — single-key (legacy removed)
if (!key || key !== process.env.BACKEND_MANAGER_WEBHOOK_KEY) {
  return assistant.respond('Invalid key', { code: 401 });
}
```

Phase 2 CHANGELOG entry goes under `BREAKING`.

## OMEGA changes (separate repo, needed for Phase 2 prep)

Touched files (do NOT do these in Phase 1 — they're for Phase 2 prep):

| File | Change |
|---|---|
| `/Users/ian/Developer/Repositories/ITW-Creative-Works/omega-manager/src/services/payment/ensure/stripe-webhook.js` | Line 38: swap `BACKEND_MANAGER_KEY` → `BACKEND_MANAGER_WEBHOOK_KEY`. Line 76 check + line 77 message + line 64 doc comment: update env var name. |
| `/Users/ian/Developer/Repositories/ITW-Creative-Works/omega-manager/src/services/payment/ensure/paypal-webhook.js` | Same change at lines 40, 66, 77, 78, 79. |
| `/Users/ian/Developer/Repositories/ITW-Creative-Works/omega-manager/src/services/payment/ensure/chargebee-webhook.js` | Same change at lines 34, 45, 57, 58, 59. |

**Idempotent re-registration + stale cleanup:** Each ensure file looks up existing webhooks **by URL**. Since the URL will change (the `key=` query param differs), the existing webhook will NOT match and a new one will be created. The OLD webhook (with the admin key) needs to be cleaned up — otherwise the third party will deliver to both and the old one will start failing 401 once Phase 2 ships.

Cleanup approach in each ensure file: after creating the new webhook, scan for any other webhook whose URL points at `/payments/webhook?processor={name}` (regardless of key) and delete the stale ones. Match on path prefix, not full URL. Stripe + PayPal + Chargebee all support webhook deletion via the same API methods these files already use for listing.

Helper: extract a `pathMatchesOurProcessor(url, processor)` in each ensure file — strip query string, match the path-and-processor segment.

## Known constraints / gotchas

1. **Phase 1 is non-breaking.** Any consumer can deploy this BEM release without touching their `.env` — the legacy key still works.
2. **`BACKEND_MANAGER_KEY` continues to grant admin via `assistant.authenticate()`.** That hasn't changed; it's still the admin secret for internal API calls (newsletter, send-email, user/delete, ghostii cron, electron-client, oauth2 state encryption). This TODO is *only* about scoping webhook endpoints to a separate key.
3. **`UNSUBSCRIBE_HMAC_KEY` is unrelated** and stays separate.
4. **Admin grant is NOT triggered by the webhook routes.** Middleware auto-runs `assistant.authenticate()` via `Usage.init()`, which reads `data.backendManagerKey` from the request body. The three webhook routes get their key via `?key=` query string (NOT body), and their request bodies are third-party payloads (Stripe events, PayPal events, Chargeblast alerts) that can't contain the real admin secret. So switching the routes' validation does NOT remove any admin-grant the handlers depend on — they write to Firestore via `libraries.admin` (Admin SDK, always full access) anyway.
5. **Test processor self-fire** must use the same key the BEM endpoint accepts, which is why the test processor URL also gets updated in Phase 1.
