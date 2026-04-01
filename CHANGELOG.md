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

# [5.0.185] - 2026-04-01
### Changed
- Use `_.merge` for dynamic template data so callers can override any nested field (e.g. `email.preview`, `personalization.name`, `data.body.*`)
- Set email schema `template` default to `'default'` instead of `undefined`

# [5.0.184] - 2026-03-31
### Changed
- Renamed email template shortcuts from `main/` to `core/` prefix across constants and all consumer files
- Added new templates: `core/plain` and `core/marketing/promotional`

# [5.0.177] - 2026-03-29
### Changed
- `payment-recovered` transition now sends email to internal team only — customer no longer receives a "Payment received" notification

# [5.0.176] - 2026-03-30
### Fixed
- Chargeblast `alert.created` events use `alertId` instead of `id` — normalizer now accepts either field
- Dispute charge matching now uses `charges.search()` instead of invoice search, fixing cases where Stripe invoices had `charge: null` even when paid (via balance/credit). Single reliable strategy: amount + ±2 day date window + card last4
### Changed
- Dispute `on-write` trigger is now processor-agnostic — Stripe-specific match/refund logic extracted to `processors/stripe.js`, matching the pattern used by payments-webhooks

# [5.0.174] - 2026-03-27
### Fixed
- Payments-orders `metadata.created` timestamp no longer overwritten on subsequent webhook events (renewals, cancellations, payment failures)

# [5.0.168] - 2026-03-21
### Fixed
- Immediately suspend subscription on payment denial (PAYMENT.SALE.DENIED, invoice.payment_failed) instead of waiting for the processor to give up retrying — recovery via PAYMENT.SALE.COMPLETED restores active status

# [5.0.167] - 2026-03-20
### Changed
- Extracted `resolveTemperature()` helper for consistency with `resolveFormatting()` and `resolveReasoning()`

# [5.0.166] - 2026-03-20
### Added
- `reasoning: true` feature flag to GPT-5.x and o-series models in MODEL_TABLE
- New GPT-5.4-mini and GPT-5.4-nano model entries with pricing

### Changed
- Reasoning parameter is now conditionally included in API requests only when the model supports it
- `resolveReasoning()` validates model support and warns when reasoning is requested for unsupported models

# [5.0.165] - 2026-03-20
### Changed
- Serve command now reads hosting port from `firebase.json` emulator config before falling back to default 5000
- Notification test fixtures migrated from flat `createdAt`/`updatedAt` to nested `metadata.created`/`metadata.updated` objects matching standard BEM metadata format

# [5.0.164] - 2026-03-18
### Added
- Default field backfill in campaign seed setup — missing fields are restored from seed defaults without overwriting user edits

# [5.0.163] - 2026-03-18
### Changed
- Refactored campaign POST/PUT routes to generic field passthrough — schema-validated fields flow through automatically via shared `buildCampaignDoc()` utility, no manual field assignments needed
- Extracted `normalizeSendAt()` and `DOC_LEVEL_FIELDS` into `routes/marketing/campaign/utils.js`

# [5.0.161] - 2026-03-18
### Added
- Port conflict detection in `serve` command — checks and kills blocking processes before starting Firebase server

### Changed
- Unblocked common team/role email local parts (`user`, `email`, `mail`, `hello`, `info`, `admin`, `support`, `contact`) from validation blocklist, as these are legitimate addresses

# [5.0.160] - 2026-03-18
### Added
- Beehiiv `resolveSegmentIds()` — fetches segments from API, builds name→ID cache (same pattern as SendGrid)
- Beehiiv segment resolution in `sendCampaign()` — SSOT keys auto-translate to Beehiiv segment IDs

### Changed
- Beehiiv `createPost()` now receives resolved segment IDs instead of raw SSOT keys

# [5.0.159] - 2026-03-18
### Added
- Audience-specific email discount codes: `UPGRADE15`, `COMEBACK20`, `MISSYOU25`, `TRYAGAIN10` with eligibility validation per user
- `{discount.code}` and `{discount.percent}` campaign template variables
- `test: true` flag on campaign route — sends real Single Send to `test_admin` segment only
- `test_admin` segment in SSOT (targets `hello@itwcreativeworks.com`)
- `trial_claimed` custom field (`user_subscription_trial_claimed`) for marketing sync
- `subscription_churned_paid` and `subscription_churned_trial` segments (replaces `subscription_churned`)
- 4 audience-specific recurring sale seed campaigns with tailored messaging + discount codes
- Full marketing campaign system documentation in CLAUDE.md, README.md, and BEM:patterns skill

### Changed
- Template variable resolution now recursive — walks all string values in settings (future-proof)
- UTM values resolved through template vars (`{holiday.name}_sale` → `black_friday_sale`)
- UTM sanitizer strips apostrophes before underscore conversion
- Payment intent + discount routes now pass user object for discount eligibility checking
- Discount code `validate()` accepts optional user param for eligibility checks (backwards compatible)

# [5.0.158] - 2026-03-17
### Added
- Newsletter generator system (`libraries/email/generators/newsletter.js`) — fetches sources from parent server, AI assembles branded content with subject/preheader
- Daily pre-generation cron (`cron/daily/marketing-newsletter-generate.js`) — generates newsletter content 24 hours before sendAt for calendar review
- `marketing.newsletter.enabled` and `marketing.newsletter.categories` config options
- `generator` field on campaign docs — tells cron to run content generation instead of sending directly

### Changed
- Seed campaign IDs are now timing-agnostic: `_recurring-sale`, `_recurring-newsletter`
- Recurrence timing removed from enforced fields — consuming projects can freely change schedule
- Newsletter subject/preheader are now AI-generated (empty in seed template)
- Frequent cron skips generator campaigns (handled by daily pre-generation cron)
- Admin cron route now passes `libraries` to cron handlers

# [5.0.157] - 2026-03-17
### Added
- Campaign template variables via `powertools.template()` — `{brand.name}`, `{season.name}`, `{holiday.name}`, `{date.month}`, `{date.year}`, `{date.full}`
- Separate SEASONS (Winter/Spring/Summer/Fall) and HOLIDAYS (New Year, Valentine's Day, Black Friday, Christmas, etc.) maps
- Audit logging in `getSegmentContacts()` — logs export start, poll status, download count, timeout

### Changed
- Seed sale campaign: quarterly → monthly on 15th, uses `{holiday.name}` template vars, targets free + cancelled + churned users, excludes paid
- Prune cron calls segment export with 3-minute timeout for large segments

### Fixed
- S3 presigned URL download broken by wonderful-fetch cache buster — set `cacheBreaker: false`
- CSV header parsing: normalize to lowercase for case-insensitive column matching

# [5.0.156] - 2026-03-17
### Added
- Marketing campaign system with full CRUD routes (`POST/GET/PUT/DELETE /marketing/campaign`)
- Calendar-backed scheduling: campaigns stored in `marketing-campaigns` Firestore collection, picked up by `bm_cronFrequent`
- Multi-provider campaign dispatch: SendGrid (Single Send) + Beehiiv (Post) + Push (FCM)
- Recurring campaigns with `recurrence` field — cron creates history docs and advances `sendAt`
- Markdown → HTML conversion at send time for campaign content
- UTM auto-tagging on brand domain links for both marketing and transactional emails (`libraries/email/utm.js`)
- Shared notification library (`libraries/notification.js`) extracted from admin route
- SEGMENTS SSOT dictionary in `constants.js` — 22 segments (subscription, lifecycle, engagement)
- Runtime segment ID resolution: `resolveSegmentIds()` maps SSOT keys to SendGrid segment IDs
- Contact pruning cron (`cron/daily/marketing-prune.js`) — monthly re-engagement + deletion of inactive contacts
- SendGrid `getSegmentContacts()` and `bulkDeleteContacts()` for segment export + batch deletion
- Seed campaigns via `npx bm setup`: `_recurring-quarterly-sale` (SendGrid) and `_recurring-weekly-newsletter` (Beehiiv) with enforced fields
- `marketing.prune.enabled` config option (default: true)
- Provider name extraction from OAuth on signup (Google, Facebook, etc.)
- Personalized greetings in welcome, checkup, deletion, and data request emails

### Changed
- `sendCampaign()` refactored for multi-provider dispatch with automatic SSOT segment key → provider ID translation
- `POST /admin/notification` slimmed down to use shared notification library
- Setup test data files (`required-indexes.js`, `seed-campaigns.js`) moved to `helpers/` directory

# [5.0.155] - 2026-03-16
### Added
- Setup test now ensures consuming project `functions/package.json` has `"private": true` to prevent accidental npm publish

# [5.0.154] - 2026-03-16
### Changed
- Add `display` property to all marketing FIELDS entries so display names are defined in the SSOT
- Beehiiv provider now maps fields to display names instead of raw keys
- Add `skip` flag for per-provider field creation control (e.g., SendGrid has first/last name built-in)

### Added
- `user_personal_name_first` and `user_personal_name_last` fields to FIELDS dictionary (skipped for SendGrid which has them built-in)

# [5.0.152] - 2026-03-16
### Fixed
- Email queue documents all stored at `emails-queue/NaN` — `powertools.random()` doesn't support string generation, replaced with `pushid()`

# [5.0.151] - 2026-03-16
### Fixed
- AI contact inference was silently broken — `ai.request()` returns `{content, tokens, ...}` but code read `result.firstName` instead of `result.content.firstName`, so AI was never used
- OpenAI API key not passed to AI library — now explicitly passes `BACKEND_MANAGER_OPENAI_API_KEY`

### Added
- `POST /admin/infer-contact` route for testing/debugging contact inference (admin-only, supports batch)
- `user_personal_company` custom field in FIELDS constant for marketing provider sync
- Company passthrough in `Marketing.add()` → SendGrid and Beehiiv providers
- Test suite for admin/infer-contact route
- Standalone test script (`scripts/test-infer-contact.js`)

### Changed
- Improved AI prompt: rejects placeholders/gibberish, always infers company from domain, preserves hyphenated name capitalization
- Disabled regex fallback — returns empty when AI can't infer a real name
- All 3 inferContact callsites (marketing/contact, user/signup, legacy add-marketing-contact) now extract and pass company

# [5.0.150] - 2026-03-16
### Added
- `marketing` config section in `backend-manager-config.json` — per-brand control over SendGrid and Beehiiv provider availability
- Beehiiv provider reads `publicationId` from config (skips fuzzy-match API call) with in-memory cache

### Changed
- Provider availability resolved once in Marketing constructor from `config.marketing` + env vars instead of per-request
- Removed `providers` parameter from `add()`, `sync()`, `remove()` and all route/schema callers

### Removed
- `DEFAULT_PROVIDERS` constant — no longer needed with config-driven provider resolution
- Provider-selection tests — no longer applicable

# [5.0.149] - 2026-03-14
### Added
- Modular email library (`libraries/email/`) — replaces monolithic `libraries/email.js` with provider-based architecture
- Marketing contact providers: SendGrid (`providers/sendgrid.js`) and Beehiiv (`providers/beehiiv.js`) with add/remove/sync operations
- Email validation library (`libraries/email/validation.js`) — format, local-part, and disposable domain checks with configurable check selection
- Runtime SendGrid custom field ID resolution — fetches field definitions from API and caches name→ID mapping (no hardcoded IDs)
- 15 marketing custom fields synced to SendGrid/Beehiiv: brand, auth, subscription, payment, and attribution data
- `PUT /marketing/contact` admin route for triggering contact sync by UID
- `POST /marketing/contact` now syncs full custom field data on signup
- Marketing contact sync in payment webhook pipeline — subscription changes automatically update SendGrid/Beehiiv custom fields
- `mailer.sync(uid)` method for full contact re-sync from Firestore user doc
- `resolveFieldValues()` in `constants.js` — SSOT for building custom field payloads from user docs
- `User.resolveSubscription()` now includes `everPaid` field for marketing segmentation
- `TEST_EXTENDED_MODE` propagation from emulator to Firebase function workers
- `TEST_EXTENDED_MODE` mismatch detection between test runner and emulator via health check
- Email queue cron processor (`cron/frequent/email-queue.js`) — processes deferred emails every 10 minutes via the full `email.send()` pipeline
- Feedback route review URL builder with full site URLs
- 28 email validation unit tests, 7 marketing contact route tests, 5 marketing lifecycle integration tests

### Changed
- Refactored `libraries/email.js` into modular `libraries/email/` directory (index, constants, validation, providers)
- `POST /marketing/contact` validation now uses configurable check selection instead of boolean `skipValidation`
- `DELETE /marketing/contact` uses new provider-based removal
- Marketing contact schemas updated to match new validation options
- `on-delete` auth event now uses new email library for contact removal
- `saveToEmailQueue` now stores raw settings instead of pre-built SendGrid email, so queued emails re-enter the full build pipeline
- Renamed `email-queue` collection to `emails-queue`
- Feedback schema: renamed `like`/`dislike` fields to `positive`/`negative`
- Feedback review prompt logic now checks total positive feedback length (50+ chars)
- Renamed `GET /app` route to `GET /brand` (completes app→brand migration)

### Removed
- Monolithic `libraries/email.js` — replaced by modular `libraries/email/` directory

# [5.0.148] - 2026-03-14
### Added
- Semantic email sender system — pass `sender: 'orders'` to `Email.send()` to auto-resolve from address, display name, and SendGrid ASM group
- 7 sender categories: `orders`, `hello`, `account`, `marketing`, `security`, `newsletter`, `internal`
- 7 dedicated SendGrid ASM groups for granular unsubscribe control
- 4 new email tests for sender resolution, override precedence, and fallback behavior

### Changed
- Migrated all email call sites from `group:` to `sender:` parameter
- `sendOrderEmail()` now accepts optional `sender` parameter (defaults to `'orders'`)
- `replyTo` now defaults to the resolved from address instead of brand default

# [5.0.147] - 2026-03-14
### Added
- 24-hour cancellation guard on `POST /payments/cancel` — blocks cancellations for subscriptions younger than 24 hours

# [5.0.146] - 2026-03-13
### Added
- Promo discount support in payment analytics — `resolveActualValue()` computes effective price accounting for trials ($0) and percentage discounts
- Promo discount details (code, percent, savings, totalToday) in new-subscription order confirmation emails

### Changed
- `trackPayment()` and `resolvePaymentEvent()` now accept `order` parameter to access discount data

# [5.0.144] - 2026-03-13
### Added
- `User.resolveSubscription()` static method that derives calculated subscription fields (plan, active, trialing, cancelling) from raw user data

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
