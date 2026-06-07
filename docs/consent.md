# Marketing Consent System

Captures, stores, and synchronizes user consent for legal terms (ToS + Privacy) and marketing communications across SendGrid + Beehiiv. Designed for GDPR / CASL / CAN-SPAM compliance with full audit metadata.

This doc covers the **server-side** (BEM) part of the system. The matching frontend pieces live in [ultimate-jekyll-manager](https://github.com/itw-creative-works/ultimate-jekyll-manager) and [web-manager](https://github.com/itw-creative-works/web-manager).

## Why this exists

1. **Capture explicit, affirmative consent** at signup with separate checkboxes for legal terms (required) and marketing communications (optional). Store the exact label text the user agreed to.
2. **Let users withdraw consent at any time** via the account-page toggle or the email-footer unsubscribe link.
3. **Stay in sync with provider-side actions** — when a user clicks unsubscribe in a SendGrid or Beehiiv email, the user doc updates AND the OTHER provider is also notified.
4. **Never re-add an unsubscribed user** — `email.add()` and `email.sync()` short-circuit when `consent.marketing.status === 'revoked'`.

## Canonical user-doc shape

Every user doc has a `consent` object with two sub-trees:

```js
consent: {
  legal: {
    status: 'granted' | 'revoked',
    grantedAt: { timestamp, timestampUNIX, source, ip, text },
  },
  marketing: {
    status: 'granted' | 'revoked',
    grantedAt: { timestamp, timestampUNIX, source, ip, text },
    revokedAt: { timestamp, timestampUNIX, source, ip, text },
  },
}
```

**Field semantics:**

- `status` — single-source-of-truth boolean state, expressed as a string enum so future states (`'pending'`, `'expired'`) don't break the schema.
- `grantedAt` / `revokedAt` — full audit metadata for the **most recent** transition of each kind. Both ALWAYS present on the doc; nulls live at the leaves (e.g. `grantedAt: { timestamp: null, ... }`), never at the object boundary. Matches BEM's `subscription.expires` / `payment.startDate` conventions.
- `legal` only has `grantedAt` (no `revokedAt`) because revoking legal consent = deleting the account.
- `text` records the **exact wording** the user agreed to. Critical for audit defense if a marketing label is challenged later.

**Object always present, nulls at leaves.** No special-casing required when reading — `account.consent.marketing.grantedAt.timestamp` is either an ISO string or `null`, never `undefined`.

### Source enum

| Source | Where it fires | Side |
|---|---|---|
| `'signup'` | Signup form checkbox toggled at account creation | both |
| `'account'` | `/account` notifications page toggle | both |
| `'admin'` | Manual admin override | both |
| `'imported'` | Legacy user migration backfill | both |
| `'sendgrid'` | SendGrid webhook event (`group_unsubscribe`, etc.) | revoke only |
| `'beehiiv'` | Beehiiv webhook event (`subscription.unsubscribed`, etc.) | revoke only |

## Capture points

There are four places where consent gets recorded or updated. All four converge on the same canonical shape.

### 1. Signup form (Phase B)

[src/manager/routes/user/signup/post.js](../src/manager/routes/user/signup/post.js) — the existing `/user/signup` route now accepts a `consent` settings field:

```js
// Client sends (lightweight transit shape):
{
  consent: {
    legal: { granted: true, text: 'I agree to ...' },
    marketing: { granted: false, text: 'I agree to receive ...' },
  },
}
```

`buildConsentRecord(assistant, settings.consent, creationTime, existingConsent)` translates this into the canonical user-doc shape:

- `legal.granted: true` → `legal.status = 'granted'`, `grantedAt` populated with `source: 'signup'` + **timestamp from Auth `creationTime`** + server-detected IP + exact label text.
- `marketing.granted: false` → `marketing.status = 'revoked'`, `grantedAt` all-null, `revokedAt` populated with `source: 'signup'`. (Records the explicit decline.)

**Timestamps come from Firebase Auth `creationTime`,** not request time, so `consent.grantedAt` matches `metadata.created` (the OMEGA user migration treats `metadata.created` as the SSOT and reconciles `grantedAt` against it — stamping from request time made every new signup drift by a few seconds and get re-fixed on the next migration run).

**Server-derived time is authoritative.** Client-supplied timestamps are ignored — defends against clock manipulation by malicious clients.

**Strict boolean check.** Only `granted === true` counts as granted. `'true'`, `1`, or other truthy values are rejected.

**Never downgrades an existing grant (data-loss guard).** A legacy account — one signed up before the `flags.signupProcessed` completion flow existed, so its flag was never set — re-fires `/user/signup` on every page load until the flag flips. Its consent was captured months ago and is long gone from `localStorage`, so the payload arrives empty. Without protection, `buildConsentRecord` would compute `'revoked'` and the `{ merge: true }` write would wipe the consent the user actually granted. The guard reads the existing doc's consent (`existingConsent`) and **preserves any already-`granted` status when the incoming payload does not explicitly re-grant it.** A genuine new grant still applies; an at-signup decline with no prior grant still records the decline. (The primary mitigation is OMEGA migration Fix 4f, which backfills `flags.signupProcessed: true` for established accounts so they never re-fire; this guard is the backstop for the deploy-before-migration gap.)

**Marketing sync gating.** After writing the user doc, the route checks `userRecord.consent.marketing.status === 'granted'` before calling `mailer.sync(uid)`. Declining the marketing checkbox means the user is created normally, gets transactional emails, but is NEVER added to SendGrid / Beehiiv marketing lists.

### 2. Account-page toggle (Phase D)

[src/manager/routes/marketing/email-preferences/post.js](../src/manager/routes/marketing/email-preferences/post.js) — authenticated mode.

```
POST /backend-manager/marketing/email-preferences
Body: { action: 'subscribe' | 'unsubscribe' }
```

- Requires authentication (uses the calling user's auth UID and email).
- Rate-limited per-user via `Manager.Usage().init(assistant)` (5/day).
- Writes `consent.marketing.{status, grantedAt|revokedAt}` to the user doc with `source: 'account'` + server time + server IP.
- Calls `mailer.sync(uid)` on subscribe, `mailer.remove(email)` on unsubscribe — hits both SendGrid + Beehiiv via the email library.

Note: `grantedAt.text` is `null` for account-page subscribes because the marketing label text is not currently passed from the frontend toggle (TODO if needed).

### 3. HMAC unsubscribe link (legacy, Phase D)

Same route, anonymous mode. The existing email-footer unsubscribe link flow:

```
POST /backend-manager/marketing/email-preferences
Body: { email, asmId, sig, action: 'subscribe' | 'unsubscribe' }
```

- `sig = HMAC-SHA256(email, UNSUBSCRIBE_HMAC_KEY)` — proves we generated the link.
- IP-rate-limited (5/day per IP).
- **Also writes the user doc** if the email maps to a user — `consent.marketing.{status, revokedAt}` with `source: 'sendgrid'` (since HMAC links only appear in SendGrid email footers).
- Backward-compatible — old in-flight email links continue to work.

### 4. Provider webhooks (Phase E)

[src/manager/routes/marketing/webhook/post.js](../src/manager/routes/marketing/webhook/post.js) — receives unsub / spam / bounce events from SendGrid and Beehiiv.

```
POST /backend-manager/marketing/webhook?provider=sendgrid&key=<BACKEND_MANAGER_WEBHOOK_KEY>
POST /backend-manager/marketing/webhook?provider=beehiiv&key=<BACKEND_MANAGER_WEBHOOK_KEY>
```

The dispatcher loads `processors/{provider}.js`, parses the event(s), and for each event:

1. Checks `isSupported(eventType)` — filters out non-revoke events like `delivered` / `open`.
2. Calls `handleEvent({ Manager, assistant, parsed })` on the processor.

There is **no idempotency ledger**. Both handler side effects — writing `consent.marketing.status = 'revoked'` and calling `mailer.remove()` — are idempotent, so a provider retry (or a duplicate fan-out from the parent) re-runs to the same end state with no extra side effects. This is the key difference from `payments-webhooks`, where dedup is load-bearing because payment side effects are not idempotent.

Each processor's `handleEvent` does the same shape of work:

1. Look up the user by `auth.email` in THIS brand's Firestore. Silent skip if not found (the email may belong to a sibling brand — see "Parent forwarder" below).
2. Write `consent.marketing.status = 'revoked'` with the appropriate `source` ('sendgrid' or 'beehiiv'), preserving `grantedAt` as informational audit history.
3. Call `mailer.remove(email)` to sync the unsubscribe to the OTHER provider (best-effort, idempotent on 404).

**Supported event types:**

| Provider | Event types treated as revoke |
|---|---|
| SendGrid | `unsubscribe`, `group_unsubscribe`, `spamreport`, `bounce`, `dropped` |
| Beehiiv | `subscription.unsubscribed`, `subscription.deleted`, `subscription.paused` |

**Beehiiv publication filter.** Each Beehiiv event includes a `publication_id`. The processor compares this against `beehiivProvider.getPublicationId()`, which reads `Manager.config.marketing.newsletter.publicationId` (populated at brand-onboarding time by OMEGA's `beehiiv/ensure/publication.js`). Mismatch → silent skip. This is how shared-publication events (e.g. devbeans shared by 6 brands) get routed correctly — each brand processes only events matching its own publication. Brands without `publicationId` in config silently skip all Beehiiv webhook events. The same convention applies to SendGrid: `marketing.campaigns.listId` is populated by OMEGA's `sendgrid/ensure/list.js`.

## Parent forwarder (Phase E)

[src/manager/routes/marketing/webhook/forward/post.js](../src/manager/routes/marketing/webhook/forward/post.js)

SendGrid and Beehiiv only let you configure a small number of webhook URLs (often one per account). With many brands sharing the same SendGrid account, we can't point the webhook at every brand's BEM directly. Instead:

```
SendGrid → POST https://api.itwcreativeworks.com/backend-manager/marketing/webhook/forward?provider=sendgrid&key=X
Beehiiv  → POST https://api.itwcreativeworks.com/backend-manager/marketing/webhook/forward?provider=beehiiv&key=X
```

The **parent BEM** (the one whose `backend-manager-config.json` has `parent: 'self'`) exposes the forwarder route. Every other BEM has the route but it returns 404 (gated on `Manager.config.parent === 'self'`).

The parent forwarder:

1. Validates `?provider=X&key=Y` (same `BACKEND_MANAGER_WEBHOOK_KEY` env var — shared across all brands).
2. Reads the `brands` collection from the parent's own Firestore.
3. For each brand: derives the child API URL by inserting `api.` into the brand's URL (`https://somiibo.com` → `https://api.somiibo.com/backend-manager/marketing/webhook?provider=X&key=Y`).
4. POSTs the raw provider body to every child in parallel via `Promise.allSettled`.
5. Returns 200 even if some children fail — idempotent child handlers make provider retries (and re-fans) safe.

### Why fan-out instead of central processing

Each brand has its own Firebase project, so its `users` collection is separate. The parent can't write to a child's Firestore. By having each child process the event against its own users, we get:

- **Correct per-brand updates** — only brands where the user actually has an account update their user docs.
- **Failure isolation** — one child being down doesn't block updates on the others.
- **Idempotent handlers** — re-processing the same event (provider retry or re-fan) produces the same end state, so no dedup ledger is needed.
- **No new schema** — no need for the parent to maintain a brand → publication map; each child filters on its own.

### Why self IS in the fan-out

The parent BEM has its own brand (e.g. `itw-creative-works`) with its own users. By fanning out via HTTP to itself like any other child, the parent's brand processes its users the same way as siblings — no special-case inline path.

### Shared-publication scenario (Beehiiv devbeans)

1. User on shared "devbeans" publication clicks unsubscribe.
2. Beehiiv posts event with `publication_id: pub_69c961a7...` to parent's `/marketing/webhook/forward`.
3. Parent fans out the raw event to all N brands.
4. The 6 brands sharing the devbeans publication: `getPublicationId()` matches, they each look up the user, only the brand(s) with the user write the doc and call `mailer.remove`.
5. The brands with dedicated publications: `getPublicationId()` mismatch, silent skip.

## Email library short-circuit

[src/manager/libraries/email/marketing/index.js](../src/manager/libraries/email/marketing/index.js)

`email.add()` and `email.sync()` check the user's `consent.marketing.status` before contacting providers. A user marked `'revoked'` is never re-added. This is the safety net against accidental re-subscription via batch syncs or campaign sends.

## Configuration

### Env vars (per brand)

```bash
# All brands
BACKEND_MANAGER_WEBHOOK_KEY="<shared-across-all-brands>"

# Existing (unchanged)
UNSUBSCRIBE_HMAC_KEY="<existing-value>"
SENDGRID_API_KEY="<account-wide>"
```

The webhook key is shared because it has to be the same value the parent forwards to each child. Rotate by updating every brand's env in lockstep.

### Provider dashboard setup

**SendGrid Event Webhook** (Settings → Mail Settings → Event Webhook):
```
URL: https://api.itwcreativeworks.com/backend-manager/marketing/webhook/forward?provider=sendgrid&key=<BACKEND_MANAGER_WEBHOOK_KEY>
Events: Group Unsubscribe, Unsubscribe, Spam Report, Bounce, Dropped
```

**Beehiiv Webhooks** (per-publication setup):
- Dedicated publications: point at the single brand's parent URL.
- Shared "devbeans" publication: point at the parent URL — fan-out handles the routing.

```
URL: https://api.itwcreativeworks.com/backend-manager/marketing/webhook/forward?provider=beehiiv&key=<BACKEND_MANAGER_WEBHOOK_KEY>
Events: subscription.unsubscribed, subscription.deleted, subscription.paused
```

### Parent vs child config

Parent's `backend-manager-config.json`:
```js
{
  parent: 'self',
  brand: { id: 'itw-creative-works', url: 'https://itwcreativeworks.com', ... },
  ...
}
```

Every other brand:
```js
{
  parent: 'https://itwcreativeworks.com',  // NO `api.` subdomain — inserted at call time
  brand: { id: 'somiibo', url: 'https://somiibo.com', ... },
  ...
}
```

**Convention:** `parent` stores the parent's brand URL (matching the format of `brand.url`), NOT the API URL. The `api.` subdomain is inserted at call time by `Manager.getParentApiUrl()`. This keeps stored config in one consistent format and lets the deployment convention (`api.` subdomain) live in one place.

**Three helpers** on the Manager instance for working with this:

- `Manager.getParentUrl()` — returns the parent's brand URL. Resolves `'self'` to `Manager.config.brand.url`.
- `Manager.getParentApiUrl()` — returns the parent's API URL (`https://api.{host}`). **Always live** — does NOT redirect to localhost in dev mode, because you can't run two Firebase emulators simultaneously. The parent's API is always the production URL regardless of which environment THIS brand is in.
- `Manager.isParent()` — boolean, true when `config.parent === 'self'`.

Only the BEM where `Manager.isParent()` returns true exposes `/marketing/webhook/forward`. Everywhere else, the route is invisible (404).

## Legacy user migration

Existing users created BEFORE the consent system has no `consent` field. They need a one-time backfill. The shape per the agreed strategy:

```js
// For every legacy user doc
{
  consent: {
    legal: {
      status: 'granted', // implicit from active account
      grantedAt: {
        timestamp: userDoc.metadata?.created?.timestamp || null,
        timestampUNIX: userDoc.metadata?.created?.timestampUNIX || null,
        source: 'imported',
        ip: userDoc.activity?.geolocation?.ip || null,
        text: null, // don't fabricate label text
      },
    },
    marketing: {
      status: 'revoked', // no opt-in on record
      grantedAt: { timestamp: null, timestampUNIX: null, source: null, ip: null, text: null },
      revokedAt: {
        timestamp: userDoc.metadata?.created?.timestamp || null,
        timestampUNIX: userDoc.metadata?.created?.timestampUNIX || null,
        source: 'imported',
        ip: userDoc.activity?.geolocation?.ip || null,
        text: null,
      },
    },
  },
}
```

**Idempotency guard:** skip docs where `consent.legal.grantedAt.source` already has a non-null value (those went through the new signup flow or a prior migration run).

Run the migration BEFORE enabling the frontend's page-load consent guard (see UJM `ENFORCE_CONSENT_GUARD` flag in `src/assets/js/core/auth.js`). Otherwise legacy users without `consent.legal.status === 'granted'` get signed out on every page load.

After the migration: optionally run a re-opt-in drip campaign to legally recover marketing consent for the users you bulk-revoked.

## Test coverage

**BEM tests:**

- [test/helpers/user.js](../test/helpers/user.js) — 31 tests covering the canonical schema, defaults, granted/revoked states, round-tripping
- [test/routes/user/signup.js](../test/routes/user/signup.js) — 3 tests for signup-time consent capture (granted both, marketing declined, missing payload)
- [test/routes/marketing/email-preferences.js](../test/routes/marketing/email-preferences.js) — 14 tests for the email-preferences route (anonymous HMAC + authenticated)
- [test/routes/marketing/webhook.js](../test/routes/marketing/webhook.js) — 15+ tests covering SendGrid + Beehiiv processors against the emulator
- [test/routes/marketing/webhook-forward.js](../test/routes/marketing/webhook-forward.js) — verifies the forwarder route returns 404 on non-parent BEMs
- [test/helpers/webhook-forward.js](../test/helpers/webhook-forward.js) — 12 unit-style tests with mocked admin + fetch, covering fan-out, URL derivation, failure isolation, self-inclusion, edge cases

**Total: 75+ tests across the consent system.**

Run with `npx mgr test` (full suite) or `npx mgr test routes/marketing/webhook` (just the webhook tests).

### Live-provider tests (extended mode only)

Most BEM tests are self-contained against the local emulator. The marketing-consent system has one test that's an exception — [test/marketing/consent-lifecycle.js](../test/marketing/consent-lifecycle.js) — which makes real API calls to SendGrid + Beehiiv to verify the full round-trip works end-to-end.

The validation pipeline (`src/manager/libraries/email/validation.js`) blocks all `_test.*` emails from reaching providers via the `/^_test\.(?!allow_)/` pattern in `blocked-local-patterns.js`. The two `_test.allow_*` sentinels (`_test.allow_consent-granted` and `_test.allow_consent-declined`) used by the lifecycle test bypass that gate intentionally, and the test cleans up after itself (phase-3 removes the granted contact via `Manager.Email().remove()`).

The "all cleanup runs at start, never at the end" rule documented in [docs/testing.md](testing.md) applies to all test data, including third-party providers.

## Frontend pieces (cross-references)

- **UJM signup form** — [signup.html](https://github.com/itw-creative-works/ultimate-jekyll-manager/blob/main/src/defaults/dist/_layouts/themes/classy/frontend/pages/auth/signup.html) (two consent checkboxes, inline error UX)
- **UJM auth library** — [libs/auth.js](https://github.com/itw-creative-works/ultimate-jekyll-manager/blob/main/src/assets/js/libs/auth.js) (`captureSignupConsent`, `validateConsent`, `reverseAccidentalSignup` for the Google-on-signin quirk)
- **UJM core auth listener** — [core/auth.js](https://github.com/itw-creative-works/ultimate-jekyll-manager/blob/main/src/assets/js/core/auth.js) (`ENFORCE_CONSENT_GUARD` flag, page-load silent-signout for orphan accounts)
- **UJM account page** — [account/index.html](https://github.com/itw-creative-works/ultimate-jekyll-manager/blob/main/src/defaults/dist/_layouts/themes/classy/frontend/pages/account/index.html) + [sections/notifications.js](https://github.com/itw-creative-works/ultimate-jekyll-manager/blob/main/src/assets/js/pages/account/sections/notifications.js)
- **Web Manager DEFAULT_ACCOUNT** — [modules/auth.js](https://github.com/itw-creative-works/web-manager/blob/main/src/modules/auth.js) (consent fields with `'revoked'` defaults so legacy reads don't crash)

## Future work

- **Country-aware default checkbox state** — pre-check both checkboxes in jurisdictions where it's legally permitted (e.g. US under CAN-SPAM). Out of scope for the initial rollout; TODO comment in signup.html.
- **Re-consent flow for material label changes** — if the marketing label text changes meaningfully, prompt existing users to re-consent (versioning via the stored `text` field).
- **Audit-log sub-collection** — currently only the most-recent transition is kept. If legal needs full history, add `users/{uid}/consent-history/{transition-id}`.
- **ECDSA / HMAC signature verification** on webhooks — SendGrid supports it, Beehiiv requires HMAC. Currently bearer-token only (`?key=`). Future hardening.
