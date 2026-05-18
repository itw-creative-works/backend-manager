# Key Files Reference

| Purpose | File |
|---------|------|
| Main Manager class | `src/manager/index.js` |
| Request/response handling | `src/manager/helpers/assistant.js` |
| Middleware pipeline | `src/manager/helpers/middleware.js` |
| Schema validation | `src/manager/helpers/settings.js` |
| Rate limiting | `src/manager/helpers/usage.js` |
| User properties + schema | `src/manager/helpers/user.js` |
| Batch utilities | `src/manager/helpers/utilities.js` |
| Auth: before-create | `src/manager/events/auth/before-create.js` |
| Auth: before-signin | `src/manager/events/auth/before-signin.js` |
| Auth: on-create | `src/manager/events/auth/on-create.js` |
| Auth: on-delete | `src/manager/events/auth/on-delete.js` |
| Auth: shared utilities | `src/manager/events/auth/utils.js` |
| Cron runner | `src/manager/events/cron/runner.js` |
| Main API handler | `src/manager/functions/core/actions/api.js` |
| Config template | `templates/backend-manager-config.json` |
| CLI entry | `src/cli/index.js` |
| Stripe webhook forwarding | `src/cli/commands/stripe.js` |
| Firebase init helper (CLI) | `src/cli/commands/firebase-init.js` |
| Firestore CLI commands | `src/cli/commands/firestore.js` |
| Auth CLI commands | `src/cli/commands/auth.js` |
| Logs CLI commands | `src/cli/commands/logs.js` |
| Intent creation | `src/manager/routes/payments/intent/post.js` |
| Webhook ingestion | `src/manager/routes/payments/webhook/post.js` |
| Webhook processing (on-write) | `src/manager/events/firestore/payments-webhooks/on-write.js` |
| Payment analytics | `src/manager/events/firestore/payments-webhooks/analytics.js` |
| Transition detection | `src/manager/events/firestore/payments-webhooks/transitions/index.js` |
| Payment processor libraries | `src/manager/libraries/payment/processors/` |
| Stripe library | `src/manager/libraries/payment/processors/stripe.js` |
| PayPal library | `src/manager/libraries/payment/processors/paypal.js` |
| Order ID generator | `src/manager/libraries/payment/order-id.js` |
| Required Firestore indexes (SSOT) | `src/cli/commands/setup-tests/helpers/required-indexes.js` |
| Test accounts | `src/test/test-accounts.js` |
