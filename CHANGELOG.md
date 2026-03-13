# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Changelog Categories

- `BREAKING` for breaking changes.
- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

# [5.0.143] - 2026-03-13
### Changed
- `sendOrderEmail()` now accepts a `copy` parameter to control whether admin receives a copy (defaults to `true` for backward compat)
- Abandoned cart reminder emails no longer send admin copies (`copy: false`) to reduce inbox noise

# [5.0.140] - 2026-03-12
### Fixed
- Chargebee meta_data backfill not including `orderId`, causing `getOrderId()` to fail on future webhooks
- `orderId` resolution now falls back to `pass_thru_content` orderId when `getOrderId()` returns null

### Changed
- `setMetaData()` API simplified to accept `(resource, meta)` instead of individual params, writing the full meta object to both subscription and customer

# [5.0.139] - 2026-03-12
### Fixed
- Chargebee hosted page checkout failing to resolve UID from webhooks because `subscription[meta_data]` is not supported by Chargebee's hosted page API
- Webhook pipeline now falls back to resolving UID from hosted page `pass_thru_content` when meta_data is missing

### Added
- `resolveUidFromHostedPage()` in Chargebee library to search recent hosted pages by subscription ID and extract UID from `pass_thru_content`
- `setMetaData()` in Chargebee library to backfill meta_data on subscriptions and customers after first UID resolution
- Automatic meta_data backfill on subscription + customer after resolving UID from pass_thru_content, so future webhooks resolve directly

### Changed
- Chargebee intent now uses `pass_thru_content` instead of `subscription.meta_data` to carry UID/orderId through checkout

# [5.0.132] - 2026-03-13
### Fixed
- Abandoned cart cron crashing with `FAILED_PRECONDITION` due to missing `payments-carts` composite index (status + nextReminderAt)
- Abandoned cart email subject and template using raw `productId` instead of resolved `productName` and `brandName`

### Changed
- Index sync (`npx bm setup`) now auto-merges local and live indexes instead of prompting to choose one direction
- Added `payments-carts` composite index to `required-indexes.js`

# [5.0.131] - 2026-03-11
### Changed
- Analytics config restructured: consolidated `googleAnalytics`, `meta`, and `tiktok` under unified `analytics.providers` namespace with `google`, `meta`, and `tiktok` keys
- Google Analytics secret moved from config (`googleAnalytics.secret`) to env var (`GOOGLE_ANALYTICS_SECRET`)
- Meta pixel ID read from `analytics.providers.meta.id` instead of `meta.pixelId`
- TikTok pixel code read from `analytics.providers.tiktok.id` instead of `tiktok.pixelCode`
- Flattened `owner` field from `{ uid: string }` to plain UID string in feedback docs, notifications, and `getDocumentWithOwnerUser()` default path
- Moved `created` timestamp inside `metadata` object in feedback documents
- Added `GOOGLE_ANALYTICS_SECRET`, `META_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN` to `.env` template
- Bumped version to 5.0.131

# [5.0.129] - 2026-03-11
### Added
- Usage proxy system: `setUser()` to bill usage to a different user, `addMirror()`/`setMirrors()` to write usage to additional Firestore docs in parallel
- Admin post route image rewriting: `extractImages()` now returns a URL map and rewrites markdown body to use `@post/` prefix for uploaded images
- `metadata` object on user schema with `created` and `updated` timestamps
- Firestore security rules: added `metadata` to server-only write fields
- Test for admin post creation route
- CLAUDE.md and README.md documentation for usage proxy and admin post route

### Changed
- User schema: moved `activity.lastActivity` to `metadata.updated` and `activity.created` to `metadata.created`
- `before-signin` event handler writes to `metadata.updated` instead of `activity.lastActivity`
- Admin user sync route writes to `metadata.created`/`metadata.updated` instead of `activity.created`/`activity.lastActivity`
- `Usage.update()` refactored to execute primary + mirror writes in parallel via `Promise.all()`
- Bumped version to 5.0.129

# [5.0.123] - 2026-03-10
### Added
- Dispute alert system: `POST /payments/dispute-alert` endpoint with Chargeblast processor for ingesting payment dispute webhooks
- Firestore trigger (`payments-disputes/{alertId}`) that matches disputes to Stripe invoices by date/amount/card, auto-refunds, and cancels subscriptions
- Discount code system: `GET /payments/discount` validation endpoint and `discount-codes.js` library (FLASH20, SAVE10, WELCOME15)
- Discount code integration in payment intent flow — auto-creates/reuses Stripe and Chargebee coupons with deterministic IDs
- Meta Conversions API and TikTok Events API tracking alongside existing GA4 in payment analytics
- Subscription renewal tracking as payment events (fires on `invoice.payment_succeeded` / `PAYMENT.SALE.COMPLETED` even without a state transition)
- `attribution`, `discount`, and `supplemental` fields on payment intent schema for checkout context tracking
- Intent data (attribution, discount, supplemental) propagated to order objects during webhook on-write
- `meta.pixelId` and `tiktok.pixelCode` fields in config template
- Journey test accounts for discount and attribution flows
- Tests for discount validation and dispute alert endpoints

### Changed
- Renamed config key `google_analytics` → `googleAnalytics`
- Payment analytics rewritten with independent per-platform fire functions (`fireGA4`, `fireMeta`, `fireTikTok`)
- Test runner module resolution now tries normal resolution first before falling back to search paths
- reCAPTCHA marketing contact test skipped when `TEST_EXTENDED_MODE` is not set

# [5.0.122] - 2026-03-09
### Added
- Abandoned cart reminder system: sends escalating emails at 15min, 3h, 24h, 48h, 72h to users who visit checkout but don't complete payment
- `payments-carts/{uid}` Firestore collection with security rules (client-side write, server-side completion)
- `bm_cronFrequent` Cloud Function running every 10 minutes for sub-daily cron jobs
- Shared cron runner (`cron/runner.js`) consolidating daily and frequent cron orchestrators
- `main/order/refunded` and `main/order/abandoned-cart` email templates
- Firestore rules test for `payments-carts` (12 test cases)

### Changed
- Migrated v1 email templates to v2 SendGrid template IDs
- `cron/daily.js` and `cron/frequent.js` now delegate to shared `cron/runner.js`
- Payment analytics tracking now fires independently of transitions

# [5.0.120] - 2026-03-09
### Added
- reCAPTCHA verification on `POST /payments/intent` route (reads `verification.g-recaptcha-response` from request body)
- Shared `libraries/recaptcha.js` module for reCAPTCHA token verification (replaces duplicate helpers)
- `verification` field in `payments/intent` schema to accept the reCAPTCHA token object

### Security
- reCAPTCHA failure responses now return generic "Request could not be verified" (403) instead of revealing the verification mechanism
- reCAPTCHA verification runs in all environments except automated tests (`isTesting()`)

### Changed
- Marketing contact routes (`POST /marketing/contact`, `bm_api add-marketing-contact`) now use shared `recaptcha.verify()` instead of inline helpers
- Marketing reCAPTCHA checks skip during automated tests (consistent with payment intent)

# [5.0.119] - 2026-03-07
### Added
- `POST /marketing/email-preferences` route for unsubscribe/resubscribe via SendGrid ASM suppression groups
- HMAC signature verification (`UNSUBSCRIBE_HMAC_KEY`) on unsubscribe links to prevent forged requests
- HMAC signature generation in email library when building unsubscribe URLs
- `UNSUBSCRIBE_HMAC_KEY` environment variable in template `.env`
- Test suite for email-preferences endpoint (10 tests covering sig verification, validation, auth)

### Changed
- Unsubscribe URL in emails no longer includes `appName` and `appUrl` params (replaced by HMAC sig)

# [5.0.118] - 2026-03-06
### Added
- Chargebee payment processor with full pipeline support (intent, webhook, cancel, refund, portal).
- Chargebee shared library (`payment/processors/chargebee.js`) with raw HTTP API wrapper, unified subscription/one-time transformers, and both Items model (new) and Plans model (legacy) product resolution.
- Chargebee webhook processor supporting subscription lifecycle events (`subscription_created`, `subscription_cancelled`, `subscription_renewed`, `payment_failed`, `payment_refunded`, etc.) and one-time invoice events.
- Chargebee intent processor for hosted page checkout (subscriptions and one-time purchases) with deterministic item price IDs (`{itemId}-{frequency}`).
- Chargebee cancel processor with immediate cancellation during trials and end-of-term cancellation otherwise.
- Chargebee refund processor with 7-day full/prorated refund logic (matching Stripe/PayPal behavior).
- Chargebee portal processor for self-service subscription management via Chargebee Portal Sessions.
- Backwards compatibility for legacy Chargebee subscriptions: reads `cf_clientorderid`/`cf_uid` custom fields alongside new `meta_data` JSON format.
- Chargebee test suite: `to-unified-subscription`, `to-unified-one-time`, and `parse-webhook` group tests with fixtures covering all status mappings, product resolution (Items + legacy Plans), and edge cases.
- Chargebee customer name extraction from `shipping_address`/`billing_address` in webhook on-write pipeline.
- `chargebee` config keys in product templates (`itemId`, `legacyPlanIds`).

### Changed
- `CHARGEBEE_SITE` environment variable is now set from config in Manager init (matching PayPal pattern), so the Chargebee library doesn't need a Manager reference.

# [5.0.111] - 2026-03-05
### Changed
- PayPal client ID is now read from `backend-manager-config.json` (`payment.processors.paypal.clientId`) instead of requiring a `PAYPAL_CLIENT_ID` environment variable.
- PayPal auth now auto-detects sandbox vs live environment by trying both endpoints in parallel on first auth, with live taking priority.

# [5.0.109] - 2026-03-04
### Added
- Immediate trial cancellation: cancelling during a free trial now terminates the subscription instantly instead of scheduling cancel at period end, preventing free premium access for the remainder of the trial.
- Intent status tracking: `payments-intents/{orderId}` is now updated with `status: completed/failed` and completion timestamp after webhook processing.
- `journey-payments-trial-cancel` test suite covering the full trial → cancel → immediate cancellation flow.

### Changed
- Stripe and test cancel processors now detect trialing state and dispatch immediate cancel (`customer.subscription.deleted`) vs period-end cancel (`customer.subscription.updated`).

# [5.0.106] - 2026-03-04
### Added
- `GET /payments/trial-eligibility`: returns whether the authenticated user is eligible for a free trial (checks for any previous subscription orders in `payments-orders`).

### Fixed
- Payment frequency mapping now supports `daily` and `weekly` in addition to `monthly` and `annually` across Stripe (`resolvePriceId`), PayPal (`resolvePlanId`), and test processor (`createSubscriptionIntent`). Previously, these frequencies silently fell back to `monthly`.
- Updated docs (CLAUDE.md, README.md) to list all four supported frequency values.

# [5.0.104] - 2026-03-02
### Added
- `POST /payments/cancel`: cancels subscription at period end via processor abstraction (Stripe sets `cancel_at_period_end=true`; test processor writes webhook directly into the Firestore pipeline).
- `POST /payments/portal`: creates Stripe Billing Portal session with cancellation disabled (users must use the cancel endpoint).
- Payment transition pipeline: `transitions/index.js` detects all subscription state changes (new-subscription, payment-failed, payment-recovered, cancellation-requested, subscription-cancelled, plan-changed) and one-time transitions (purchase-completed, purchase-failed). Handlers fire-and-forget, send transactional emails.
- Payment analytics: `analytics.js` tracks GA4 payment events for all transitions (non-blocking, skipped in tests).
- Shared payment processor libraries: `payment/processors/stripe.js` (toUnifiedSubscription, toUnifiedOneTime, resolveCustomer, resolvePriceId, fetchResource), `payment/processors/paypal.js`, `payment/processors/test.js`, `payment/order-id.js`.
- `Email` library (`libraries/email.js`): shared transactional email via SendGrid, used by transition handlers and admin routes.
- `infer-contact.js` library: infers user name from payment processor data, auto-fills on first purchase.
- `routes/user/data-request/` (get/post/delete): GDPR data request endpoints.
- `cron/daily/data-requests.js`: daily cron to process pending GDPR data requests.
- CLI commands: `auth` (get/list/delete/set-claims), `firestore` (get/set/query/delete), `firebase-init`, `emulator` (renamed from `emulators`).
- `setup-tests/firestore-indexes-required.js`: validates required Firestore indexes exist before tests run.
- Comprehensive payment test suite: journey tests for one-time purchase, one-time failure, payment failure, plan change, cancel endpoint; route validation tests for cancel and portal; unit tests for `toUnifiedOneTime()`, `stripe-parse-webhook`, `infer-contact`, `email`; real Stripe CLI fixtures.
- Dedicated isolated test accounts for every mutating payment test (no shared state between tests).

### Changed
- `admin/email/post.js`, `general/email/post.js`: refactored to delegate to shared Email library (~400 lines removed from each).
- `marketing/contact/post.js`, `api/general/add-marketing-contact.js`: delegate to infer-contact + marketing library.
- `user/signup/post.js`: rewritten with new middleware pattern.
- `auth/on-create.js`: simplified, inline logic moved to middleware.
- `api/admin/send-email.js`: removed `ensureUnique` and SendGrid contact name lookup (handled by Email library).
- All admin routes: middleware pattern cleanup.
- `config.payment.products` now supports `type: 'one-time'` products with `prices.once` key.
- Test runner: improved discovery, filtering, and output formatting.

### Removed
- `src/manager/libraries/stripe.js`, `src/manager/libraries/test.js`: replaced by `payment/processors/` shared libs.
- `REFACTOR-BEM-API.md`, `REFACTOR-MIDDLEWARE.md`, `REFACTOR-PAYMENT.md`: work completed, files deleted.
- `bin/bem`: replaced by `bin/backend-manager`.

# [5.0.84] - 2026-02-19
### BREAKING
- Moved `config.products` to `config.payment.products`. All product lookups now use `config.payment.products`.
- Renamed `subscription.trial.activated` to `subscription.trial.claimed` across the entire subscription schema, API responses, analytics properties, and tests.
- Renamed analytics user property `plan_id` to `subscription_id` and `plan_trial_activated` to `subscription_trial_claimed`.
- Removed `Manager.getApp()` method (previously fetched from ITW Creative Works endpoint).
- Removed `Manager.SubscriptionResolver()` factory method.
- Removed deprecated `RUNTIME_CONFIG` .env loading from config merge.
- Test accounts now use `subscription.*` instead of `plan.*`.

### Added
- Stripe payment integration with shared library (`src/manager/libraries/stripe.js`) and `toUnified()` transformer that maps Stripe subscription states to the unified subscription schema.
- Test payment processor library that delegates to Stripe's transformer with `processor: 'test'`.
- Payment webhook route (`POST /payments/webhook`) with processor-specific handlers for Stripe (with signature verification) and test, including idempotent event storage in `payments-webhooks` Firestore collection.
- Payment intent route (`POST /payments/intent`) for creating checkout sessions with processor-specific handlers.
- Firestore trigger (`bm_paymentsWebhookOnWrite`) that processes stored webhook events and updates user subscription documents.
- Payment schemas for webhook and intent validation.
- `payment.processors` config section for Stripe, PayPal, Chargebee, and Coinbase configuration.
- `npx bm stripe` CLI command for standalone Stripe webhook forwarding.
- Auto-start Stripe CLI webhook forwarding with `npx bm emulator` (gracefully skips when prerequisites are missing).
- `Manager.version` property exposing the BEM package version.
- Journey test accounts for payment lifecycle testing (upgrade, cancel, suspend, trial).
- Stripe fixture data for subscription states (active, trialing, canceled).
- Tests for `stripe-to-unified` transformer, payment webhook route, and payment intent route.
- Test cleanup for payment-related Firestore collections (`payments-subscriptions`, `payments-webhooks`, `payments-intents`).

### Changed
- Cron schedule from `every 24 hours` to `0 0 * * *` (explicit midnight UTC).
- Test runner now passes full config object (with convenience aliases) for payment processor access.
- Unauthenticated usage tests now use relative assertions instead of absolute values.

### Removed
- Removed `PAYPAL_CLIENT_ID` and `CHARGEBEE_SITE` from `.env` template (now configured via `payment.processors` in config).

# [5.0.39] - 2025-01-12
### Added
- New test infrastructure with Firebase emulator support for reliable, isolated testing.
- Test runner with emulator auto-detection and startup.
- Test types: standalone, suite (sequential with shared state), group (independent).
- Built-in test accounts with SSOT configuration (basic, admin, premium-active, etc.).
- Firestore security rules testing support.
- HTTP client with auth helpers (`http.as('admin').command()`).
- Rich assertion library (`isSuccess`, `isError`, `hasProperty`, etc.).
- New `bm emulator` command for standalone emulator management.
- Enhanced `bm test` with path filtering and parallel test support.

### Changed
- Reorganized test files to `test/functions/` with `admin/`, `user/`, `general/` categories.
- Standardized auth test naming to `unauthenticated-rejected`.
- Auth rejection tests moved to end of test files (before cleanup).

### Fixed
- Changed unauthenticated API error from 500 to 401 with proper "Authentication required" message.

### Removed
- Removed legacy test files (moved to `test/_legacy/`).
- Removed deprecated CLI files and templates.
- Consolidated test account creation from API endpoint to test runner.

# [5.0.31] - 2025-01-17
### Changed
- Refactored CLI to modular command architecture with individual command classes and test files for better maintainability.
- Migrated from deprecated `.runtimeconfig.json` to `.env` file with `RUNTIME_CONFIG` environment variable.

### Removed
- Removed deprecated Firebase config commands (`config:get`, `config:set`, `config:unset`).

### Fixed
- Fixed `install:local` command to save to dependencies instead of devDependencies.
- Fixed reserved word conflicts with `package` parameter.
- Fixed template file path resolution in setup tests.

# [5.0.0] - 2025-07-10
### ⚠️ BREAKING
- Node.js version requirement is now `22`.
- `Manager.init()` no longer wraps the initializeApp() in `try/catch` block.
- `Settings()` API tries to look for a method-specific file first (e.g., `name/get.js`, `name/post.js`, etc.) before falling back to `name/index.js`. This allows for more modular and organized code structure. Also, `name.js` is no longer valid, we now look for `name/index.js` this is to make it consistent with the `Middleware()` API.
- `Middleware()` API now tries to load method-specific files (e.g., `name/get.js`, `name/post.js`, etc.) before falling back to `name/index.js`.
- `ai.request()` no longer accepts `options.message.images`. Use `options.message.attachments` instead.

# [4.2.22] - 2024-12-19
### Changed
- `Manager.install()` now automatically binds the fn with the proper `this` context (this may be breaking).

# [4.1.0] - 2024-12-19
### Changed
- Attach `schema` to `bm-properties` response header.
- `assistant.request.url` is now properly set for all environments (development, production, etc) and works whether called from custom domain or Firebase default function domain.

## [4.0.0] - 2024-05-08
### ⚠️ BREAKING
- Require Node.js version `18` or higher.
- Updated `firebase-functions` to `6.0.1` (now need to require `firebase-functions/v1` to use v1 functions or `firebase-functions/v2` to use v2 functions).

## [3.2.109] - 2024-05-08
### Changed
- Replaced all `methods` references with `routes`. This should be changed in your code as well.

## [3.2.32] - 2024-01-30
### Changed
- Modified `.assistant().errorify()` to have defaults of `log`, `sentry`, and `send` to `false` if not specified to prevent accidental logging and premature sending of errors.

## [3.2.30] - 2024-01-30
### Changed
- Modified `.assistant()` token/key check to use `options.apiKey || data.apiKey`

## [3.2.0] - 2024-01-19
### Added
- Added `.settings()` API. Put your settings in `./schemas/*.js` and access them with `assistant.settings.*`.

## [3.1.0] - 2023-12-19
### Added
- Added `.analytics()` API GA4 support.

#### New Analytics Format
```js
  analytics.send({
    name: 'tutorial_begin',
    params: {
      tutorial_id: 'tutorial_1',
      tutorial_name: 'the_beginning',
      tutorial_step: 1,
    },
  });
```
- Added `.usage()` API to track user usage.
- Added `.middleware()` API to help setup http functions.
- Added `.respond()` function to `assistant.js` to help with http responses.

## [3.0.0] - 2023-09-05
### ⚠️ BREAKING
- Updated `firebase-admin` from `9.12.0` --> `11.10.1`
- Updated `firebase-functions` from `3.24.1` --> `4.4.1`
- This project now requires `firebase-tools` from `10.9.2` --> `12.5.2`

- Updated required Node.js version from `12` --> `16`

- Updated `@google-cloud/storage` from `5.20.5` --> `7.0.1`
- Updated `fs-jetpack` from `4.3.1` --> `5.1.0`
- Updated `uuid` from `8.3.2` --> `9.0.0`

- Removed `backend-assistant` dependency and moved to custom library within this module at `./src/manager/helpers/assistant.js`
- Replaced `require('firebase-functions/lib/logger/compat')` with the updated `require('firebase-functions/logger/compat')`
- Changed default for `options.setupFunctionsLegacy` from `true` --> `false`
- `.analytics()` is broken due to GA4 updates and should not be used until the next feature release
- Updated geolocation and client data retrieval to new format:
#### New Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.geolocation.ip;
  assistant.request.geolocation.continent;
  assistant.request.geolocation.country;
  assistant.request.geolocation.region;
  assistant.request.geolocation.city;
  assistant.request.geolocation.latitude;
  assistant.request.geolocation.longitude;

  // Get Client data
  assistant.request.client.userAgent;
  assistant.request.client.language;
  assistant.request.client.platform;
  assistant.request.client.mobile;
```

#### Old Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.ip;
  assistant.request.continent;
  assistant.request.country;
  assistant.request.region;
  assistant.request.city;
  assistant.request.latitude;
  assistant.request.longitude;

  // Get Client data
  assistant.request.userAgent;
  assistant.request.language;
  assistant.request.platform;
  assistant.request.mobile;
```

## [2.6.0] - 2023-09-05
### Added
- Identity Platform auth/before-create.js
- Identity Platform auth/before-signin.js
- Disable these by passing `options.setupFunctionsIdentity: false`
