# Backend Manager (BEM)

> **Note for contributors and Claude:** This file is the architectural overview — identity, top-level conventions, and a map to deep references. The **meat** (per-subsystem APIs, behavior tables, recipes) lives in `docs/<topic>.md`. When extending or adding content, write it in the matching `docs/*.md` file and cross-link from here — do NOT inline it. If a topic doesn't have a doc yet, create one. Goal: keep this file under 250 lines.

## Project Identity

**Backend Manager (BEM)** is an NPM package that provides powerful backend features for Firebase Cloud Functions projects, including authentication, rate limiting, analytics, and more.

**This repository** (`backend-manager`) is the BEM library itself. If you're working here, you're contributing to the library, not consuming it.

**Consumer projects** are Firebase projects that `require('backend-manager')` in their `functions/index.js`. These have:
- `functions/` directory with `index.js` that calls `Manager.init(exports, {...})`
- `backend-manager-config.json` configuration file
- `service-account.json` for Firebase credentials
- Optional `routes/` and `schemas/` directories for custom endpoints

## Architecture (at a glance)

BEM exposes a single `Manager` class that orchestrates everything: it initializes Firebase Admin, wires built-in functions (`bm_api`, auth events, cron), and hands out helper instances via factory methods. Supports **two deployment modes** — Firebase Functions (`projectType: 'firebase'`) or Custom Server (`projectType: 'custom'`). See [docs/architecture.md](docs/architecture.md) for the full overview of the Manager class, dual-mode support, and helper factory pattern.

For the directory layout of both the BEM library and consumer projects, see [docs/directory-structure.md](docs/directory-structure.md).

## Documentation

Deep references live in `docs/`. **Whenever you make a behavioral change, update both this overview AND the relevant `docs/*.md` deep reference.**

### Architecture & Conventions

- [docs/architecture.md](docs/architecture.md) — Manager class, dual-mode (firebase/custom), helper factory pattern
- [docs/directory-structure.md](docs/directory-structure.md) — BEM library + consumer project layouts
- [docs/code-patterns.md](docs/code-patterns.md) — short-circuit returns, logical operators on new lines, Firestore shorthand, template-string requires, fs-jetpack preference
- [docs/file-naming.md](docs/file-naming.md) — naming table for routes, schemas, API commands, events, cron jobs, hooks
- [docs/environment-detection.md](docs/environment-detection.md) — `assistant.isDevelopment/isProduction/isTesting()`
- [docs/response-headers.md](docs/response-headers.md) — automatic `bm-properties` header

### Building Routes & Components

- [docs/routes.md](docs/routes.md) — recipes for new API commands, routes, event handlers, cron jobs (with code templates)
- [docs/schemas.md](docs/schemas.md) — schema definition format, defaults vs premium overrides
- [docs/sanitization.md](docs/sanitization.md) — automatic XSS sanitization, schema opt-out (`sanitize: false`), route-level opt-out, manual `utilities.sanitize()`
- [docs/auth-hooks.md](docs/auth-hooks.md) — consumer hooks for `before-create`/`before-signin`/`on-create`/`on-delete` (blocking + non-blocking examples)
- [docs/common-operations.md](docs/common-operations.md) — inside-the-handler patterns: authenticate, read/write Firestore, error handling, send response, `bm_api` hook

### Built-in Routes

- [docs/admin-post-route.md](docs/admin-post-route.md) — `POST/PUT /admin/post` blog creation via GitHub (image extraction + `@post/` rewriting)
- [docs/payment-system.md](docs/payment-system.md) — full payment pipeline: Intent → Webhook → On-Write → Transition; subscription model, statuses, `resolveSubscription()`, transition handlers, processor interface, product config, test processor
- [docs/marketing-campaigns.md](docs/marketing-campaigns.md) — campaign CRUD routes, recurring campaigns, generator pipeline (newsletter), template-owned schemas, asset hosting, seed campaigns
- [docs/mcp.md](docs/mcp.md) — Model Context Protocol server: 19 tools, stdio + HTTP transports, OAuth, Claude Chat/Code configuration

### Subsystems & Libraries

- [docs/usage-rate-limiting.md](docs/usage-rate-limiting.md) — usage tracking, monthly/daily caps, `setUser()` + mirrors for proxy usage, reset schedule
- [docs/ai-library.md](docs/ai-library.md) — `Manager.AI()` unified entry for OpenAI + Anthropic
- [docs/marketing-fields.md](docs/marketing-fields.md) — adding custom fields to SendGrid + Beehiiv via the BEM/OMEGA SSOT pair
- [docs/stripe-webhook-forwarding.md](docs/stripe-webhook-forwarding.md) — auto-started Stripe CLI forwarding for local dev

### Testing & CLI

- [docs/testing.md](docs/testing.md) — running, filtering, log files, test types (standalone/suite/group), context object, assertions, auth levels
- [docs/cli-firestore-auth.md](docs/cli-firestore-auth.md) — `npx mgr firestore:*` and `auth:*` commands, shared flags, examples
- [docs/cli-logs.md](docs/cli-logs.md) — `npx mgr logs:read` / `logs:tail` with full flag reference and built-in Cloud Function names

## Common Mistakes to Avoid

1. **Don't modify Manager internals directly** — Use factory methods and public APIs
2. **Always use `assistant.respond()` for responses** — Don't use `res.send()` directly
3. **Match schema names to route names** — If route is `myEndpoint`, schema should be `myEndpoint`
4. **Always await async operations** — Don't forget `await` on Firestore operations
5. **Handle errors properly** — Use `assistant.errorify()` with appropriate status codes
6. **Don't call `respond()` multiple times** — Only one response per request
7. **Use short-circuit returns** — Return early from error conditions
8. **Increment usage before update** — Call `usage.increment()` then `usage.update()`
9. **Add Firestore composite indexes for new compound queries** — Any new Firestore query using multiple `.where()` clauses or `.where()` + `.orderBy()` requires a composite index. Add it to `src/cli/commands/setup-tests/helpers/required-indexes.js` (the SSOT). Consumer projects pick these up via `npx mgr setup`, which syncs them into `firestore.indexes.json`. Without the index, the query will crash with `FAILED_PRECONDITION` in production.

## Key Files Reference

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
