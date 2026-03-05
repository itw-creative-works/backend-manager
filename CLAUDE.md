# Backend Manager (BEM) - Claude Code Instructions

This document provides instructions for Claude Code when working with Backend Manager projects.

## Project Identity

**Backend Manager (BEM)** is an NPM package that provides powerful backend features for Firebase Cloud Functions projects, including authentication, rate limiting, analytics, and more.

**This repository** (`backend-manager`) is the BEM library itself. If you're working here, you're contributing to the library, not consuming it.

**Consumer projects** are Firebase projects that `require('backend-manager')` in their `functions/index.js`. These have:
- `functions/` directory with `index.js` that calls `Manager.init(exports, {...})`
- `backend-manager-config.json` configuration file
- `service-account.json` for Firebase credentials
- Optional `routes/` and `schemas/` directories for custom endpoints

## Architecture Overview

### Manager Class
The core `Manager` class (in `src/manager/index.js`) extends EventEmitter and orchestrates all functionality:
- Initializes Firebase Admin SDK
- Sets up built-in Cloud Functions (`bm_api`, auth events, cron)
- Provides factory methods for helper classes
- Manages configuration from multiple sources

### Dual-Mode Support
BEM supports two deployment modes:
- **Firebase Functions** (`projectType: 'firebase'`): Cloud Functions with Firebase triggers
- **Custom Server** (`projectType: 'custom'`): Express server for non-Firebase deployments

### Helper Factory Pattern
All helpers are accessed via factory methods on the Manager instance:
```javascript
Manager.Assistant({ req, res })  // Request handler
Manager.User(data)               // User properties
Manager.Analytics({ assistant }) // GA4 events
Manager.Usage()                  // Rate limiting
Manager.Middleware(req, res)     // Request pipeline
Manager.Settings()               // Schema validation
Manager.Utilities()              // Batch operations
Manager.Metadata(doc)            // Timestamps/tags
Manager.storage({ name })        // Local JSON storage (lowdb)
```

## Directory Structure

### BEM Library (this repo)
```
src/
  manager/
    index.js                          # Main Manager class
    helpers/                          # Helper classes
      assistant.js                    # Request/response handling
      user.js                         # User property structure + schema
      analytics.js                    # GA4 integration
      usage.js                        # Rate limiting
      middleware.js                   # Request pipeline
      settings.js                     # Schema validation
      utilities.js                    # Batch operations
      metadata.js                     # Timestamps/tags
    libraries/
      payment/                        # Shared payment utilities
        order-id.js                   # Order ID generation (XXXX-XXXX-XXXX)
        processors/                   # Payment processor libraries
          stripe.js                   # Stripe SDK init, fetchResource, toUnified*, resolvePriceId
          paypal.js                   # PayPal fetchResource, toUnified* (custom_id parsing)
          test.js                     # Test processor (delegates to Stripe shapes)
    functions/core/                   # Built-in functions
      actions/
        api.js                        # Main bm_api handler
        api/{category}/{action}.js    # API command handlers
      events/
        auth/                         # Auth event handlers
        firestore/                    # Firestore triggers
          payments-webhooks/          # Webhook processing pipeline
            on-write.js               # Orchestrator: fetch→transform→transition→write
            analytics.js              # Payment analytics tracking (GA4, Meta, TikTok)
            transitions/              # State transition detection + handlers
              index.js                # Transition detection logic
              send-email.js           # Shared email helper for handlers
              subscription/           # Subscription transition handlers
              one-time/               # One-time payment transition handlers
      cron/
        daily.js                      # Daily cron runner
        daily/{job}.js                # Individual cron jobs
    routes/                           # Built-in routes
      payments/
        intent/                       # POST /payments/intent
          post.js                     # Intent creation orchestrator
          processors/                 # Per-processor intent creators
            stripe.js                 # Stripe Checkout Session creation
            paypal.js                 # PayPal subscription + one-time order creation
            test.js                   # Test processor (auto-fires webhooks)
        webhook/                      # POST /payments/webhook
          post.js                     # Webhook ingestion + Firestore write
          processors/                 # Per-processor webhook parsers
            stripe.js                 # Stripe event parsing + categorization
            paypal.js                 # PayPal event parsing + categorization
            test.js                   # Test processor (delegates to Stripe)
        cancel/                       # POST /payments/cancel
          processors/
            stripe.js                 # Stripe cancel_at_period_end
            paypal.js                 # PayPal subscription cancel
            test.js                   # Test cancel (writes webhook doc)
        refund/                       # POST /payments/refund
          processors/
            stripe.js                 # Stripe refund + immediate cancel
            paypal.js                 # PayPal refund + cancel
            test.js                   # Test refund (writes webhook doc)
        portal/                       # POST /payments/portal
          processors/
            stripe.js                 # Stripe billing portal URL
            paypal.js                 # PayPal management URL
    schemas/                          # Built-in schemas
  cli/
    index.js                          # CLI entry point
    commands/                         # CLI commands
  test/
    test-accounts.js                  # Test account definitions (static + journey)
templates/
  backend-manager-config.json         # Config template
```

### Consumer Project Structure
```
functions/
  index.js                            # Manager.init() + custom functions
  backend-manager-config.json         # App configuration
  service-account.json                # Firebase credentials
  routes/
    {endpoint}/
      index.js                        # All methods handler
      get.js                          # GET handler
      post.js                         # POST handler
  schemas/
    {endpoint}/
      index.js                        # Schema definition
  hooks/
    cron/
      daily/
        {job}.js                      # Custom daily jobs
```

## Code Patterns

### Short-Circuit Returns
Use early returns instead of nested conditionals:
```javascript
// CORRECT
function handler(data) {
  if (!data) {
    return assistant.errorify('Missing data', { code: 400 });
  }

  // Main logic here
  return assistant.respond({ success: true });
}

// INCORRECT
function handler(data) {
  if (data) {
    // Main logic here
    return assistant.respond({ success: true });
  }
}
```

### Logical Operators on New Lines
Place operators at the start of continuation lines:
```javascript
// CORRECT
const isValid = hasPermission
  || isAdmin
  || isOwner;

// INCORRECT
const isValid = hasPermission ||
  isAdmin ||
  isOwner;
```

### Firestore Document Access
Use shorthand `.doc()` path:
```javascript
// CORRECT
admin.firestore().doc('users/abc123')

// INCORRECT
admin.firestore().collection('users').doc('abc123')
```

### Template Strings for Requires
```javascript
// CORRECT
require(`${functionsDir}/node_modules/backend-manager`)

// INCORRECT
require(functionsDir + '/node_modules/backend-manager')
```

### Prefer fs-jetpack
Use `fs-jetpack` over `fs` or `fs-extra` for file operations.

## Creating New Components

### New API Command

Create `src/manager/functions/core/actions/api/{category}/{action}.js`:

```javascript
function Module() {}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Validate input
    if (!payload.data.payload.requiredField) {
      return reject(assistant.errorify('Missing required field', { code: 400 }));
    }

    // Business logic here
    const result = { success: true };

    // Log and return
    assistant.log('Action completed', result);
    return resolve({ data: result });
  });
};

module.exports = Module;
```

### New Route (Consumer Project)

Create `routes/{name}/index.js`:

```javascript
function Route() {}

Route.prototype.main = async function (assistant) {
  const Manager = assistant.Manager;
  const usage = assistant.usage;
  const user = assistant.usage.user;
  const analytics = assistant.analytics;
  const settings = assistant.settings;

  // Check authentication if needed
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Track usage
  await usage.validate('requests');
  usage.increment('requests');
  await usage.update();

  // Send response
  assistant.respond({ success: true, data: settings });
};

module.exports = Route;
```

### New Schema (Consumer Project)

Create `schemas/{name}/index.js`:

```javascript
module.exports = function (assistant, settings, options) {
  const user = options.user;

  return {
    defaults: {
      fieldName: {
        types: ['string'],
        default: 'default value',
        required: false,
      },
      numericField: {
        types: ['number'],
        default: 10,
        min: 1,
        max: 100,
      },
    },
    // Override for premium users
    premium: {
      numericField: {
        max: 1000,
      },
    },
  };
};
```

### New Event Handler

Create `src/manager/functions/core/events/{type}/{event}.js`:

```javascript
function Module() {}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.assistant = Manager.Assistant();
  self.libraries = Manager.libraries;
  self.user = payload.user;
  self.context = payload.context;
  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    const { admin } = self.libraries;

    assistant.log('Event triggered', self.user);

    // Event logic here

    return resolve(self);
  });
};

module.exports = Module;
```

### New Cron Job (Consumer Project)

Create `hooks/cron/daily/{job}.js`:

```javascript
function Job() {}

Job.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    assistant.log('Running daily job...');

    // Job logic here

    return resolve();
  });
};

module.exports = Job;
```

## Common Operations

### Authenticate User
```javascript
const user = await assistant.authenticate();
if (!user.authenticated) {
  return assistant.errorify('Authentication required', { code: 401 });
}
```

### Read/Write Firestore
```javascript
const { admin } = Manager.libraries;

// Read
const doc = await admin.firestore().doc('users/abc123').get();
const data = doc.data();

// Write
await admin.firestore().doc('users/abc123').set({ field: 'value' }, { merge: true });
```

### Handle Errors
```javascript
// Send error response
assistant.errorify('Something went wrong', { code: 500, sentry: true });

// Or throw to reject
return reject(assistant.errorify('Bad request', { code: 400 }));
```

### Send Response
```javascript
// Success
assistant.respond({ success: true, data: result });

// With custom status
assistant.respond({ created: true }, { code: 201 });

// Redirect
assistant.respond('https://example.com', { code: 302 });
```

### Use Hooks (Consumer Project)
```javascript
Manager.handlers.bm_api = function (mod, position) {
  const assistant = mod.assistant;
  const command = assistant.request.data.command;

  return new Promise(async function(resolve, reject) {
    if (position === 'pre' && command === 'user:sign-up') {
      // Before sign-up logic
    }
    return resolve();
  });
};
```

## File Naming Conventions

| Type | Location | Naming |
|------|----------|--------|
| Routes | `routes/{name}/` | `index.js` or `{method}.js` |
| Schemas | `schemas/{name}/` | `index.js` or `{method}.js` |
| API Commands | `actions/api/{category}/` | `{action}.js` |
| Auth Events | `events/auth/` | `{event}.js` |
| Cron Jobs | `cron/daily/` or `hooks/cron/daily/` | `{job}.js` |

## Testing

### Running Tests
```bash
# Option 1: Two terminals
npx bm emulator  # Terminal 1 - keeps emulator running
npx bm test      # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulator)
npx bm test
```

### Log Files
Both `npx bm emulator` and `npx bm test` automatically save all output to log files in the project directory while still streaming to the console:
- **`emulator.log`** — Full emulator output (Firebase emulator + Cloud Functions logs)
- **`test.log`** — Test runner output (when running against an existing emulator)

When `npx bm test` starts its own emulator, logs go to `emulator.log` (since it delegates to the emulator command). When running against an already-running emulator, logs go to `test.log`.

These files are overwritten on each run and are gitignored (`*.log`). Use them to search for errors, debug webhook pipelines, or review full function output after a test run.

### Filtering Tests
```bash
npx bm test rules/             # Run rules tests (both BEM and project)
npx bm test bem:rules/         # Only BEM's rules tests
npx bm test project:rules/     # Only project's rules tests
npx bm test user/ admin/       # Multiple paths
```

### Test Locations
- **BEM core tests:** `test/`
- **Project tests:** `functions/test/bem/`

Use `bem:` or `project:` prefix to filter by source.

### Test Types

| Type | Use When | Behavior |
|------|----------|----------|
| Standalone | Single logical test | Runs once |
| Suite (`type: 'suite'`) | Sequential dependent tests | Shared state, stops on failure |
| Group (`type: 'group'`) | Multiple independent tests | Continues on failure |

### Standalone Test
```javascript
module.exports = {
  description: 'Test name',
  auth: 'none',  // none, user, admin, premium-active, premium-expired
  timeout: 10000,
  async run({ http, assert, accounts, firestore, state, waitFor }) { },
  async cleanup({ ... }) { },  // Optional
};
```

### Suite (Sequential with Shared State)
```javascript
module.exports = {
  description: 'Suite name',
  type: 'suite',
  tests: [
    { name: 'step-1', async run({ state }) { state.value = 'shared'; } },
    { name: 'step-2', async run({ state }) { /* state.value available */ } },
  ],
};
```

### Group (Independent Tests)
```javascript
module.exports = {
  description: 'Group name',
  type: 'group',
  tests: [
    { name: 'test-1', auth: 'admin', async run({ http, assert }) { } },
    { name: 'test-2', auth: 'none', async run({ http, assert }) { } },
  ],
};
```

### Context Object
| Property | Description |
|----------|-------------|
| `http` | HTTP client (`http.command()`, `http.as('admin').command()`) |
| `assert` | Assertion helpers (see below) |
| `accounts` | Test accounts `{ basic, admin, premium-active, ... }` |
| `firestore` | Direct DB access (`get`, `set`, `delete`, `exists`) |
| `state` | Shared state (suites only) |
| `waitFor` | Polling helper `waitFor(condition, timeout, interval)` |

### Assert Methods
```javascript
assert.ok(value, message)                      // Truthy
assert.equal(a, b, message)                    // Strict equality
assert.notEqual(a, b, message)                 // Not equal
assert.deepEqual(a, b, message)                // Deep equality
assert.match(value, /regex/, message)          // Regex match
assert.isSuccess(response, message)            // Response success
assert.isError(response, code, message)        // Response error with code
assert.hasProperty(obj, 'path.to.prop', msg)   // Property exists
assert.propertyEquals(obj, 'path', value, msg) // Property value
assert.isType(value, 'string', message)        // Type check
assert.contains(array, value, message)         // Array includes
assert.inRange(value, min, max, message)       // Number range
assert.fail(message)                           // Explicit fail
```

### Auth Levels
`none`, `user`/`basic`, `admin`, `premium-active`, `premium-expired`

### Key Test Files
| File | Purpose |
|------|---------|
| `src/test/runner.js` | Test runner |
| `test/` | BEM core tests |
| `src/test/utils/assertions.js` | Assert helpers |
| `src/test/utils/http-client.js` | HTTP client |
| `src/test/test-accounts.js` | Test account definitions |

## Stripe Webhook Forwarding

BEM auto-starts Stripe CLI webhook forwarding when running `npx bm serve` or `npx bm emulator`. This forwards Stripe test webhooks to the local server so the full payment pipeline works end-to-end during development.

**Requirements:**
- `STRIPE_SECRET_KEY` set in `functions/.env`
- `BACKEND_MANAGER_KEY` set in `functions/.env`
- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed

**Standalone usage:**
```bash
npx bm stripe
```

If any prerequisite is missing, webhook forwarding is silently skipped with an info message.

The forwarding URL is: `http://localhost:{hostingPort}/backend-manager/payments/webhook?processor=stripe&key={BACKEND_MANAGER_KEY}`

## CLI Utility Commands

Quick commands for reading/writing Firestore and managing Auth users directly from the terminal. Works in any BEM consumer project (requires `functions/service-account.json` for production, or `--emulator` for local).

### Firestore Commands

```bash
npx bm firestore:get <path>                          # Read a document
npx bm firestore:set <path> '<json>'                 # Write/merge a document
npx bm firestore:set <path> '<json>' --no-merge      # Overwrite a document entirely
npx bm firestore:query <collection>                  # Query a collection (default limit 25)
  --where "field==value"                              #   Filter (repeatable for AND)
  --orderBy "field:desc"                              #   Sort
  --limit N                                           #   Limit results
npx bm firestore:delete <path>                       # Delete a document (prompts for confirmation)
```

### Auth Commands

```bash
npx bm auth:get <uid-or-email>                       # Get user by UID or email (auto-detected via @)
npx bm auth:list [--limit N] [--page-token T]        # List users (default 100)
npx bm auth:delete <uid-or-email>                    # Delete user (prompts for confirmation)
npx bm auth:set-claims <uid-or-email> '<json>'       # Set custom claims
```

### Shared Flags

| Flag | Description |
|------|-------------|
| `--emulator` | Target local emulator instead of production |
| `--force` | Skip confirmation on destructive operations |
| `--raw` | Compact JSON output (for piping to `jq` etc.) |

### Examples

```bash
# Read a user document from production
npx bm firestore:get users/abc123

# Write to emulator
npx bm firestore:set users/test123 '{"name":"Test User"}' --emulator

# Query with filters
npx bm firestore:query users --where "subscription.status==active" --limit 10

# Look up auth user by email
npx bm auth:get user@example.com

# Set admin claims
npx bm auth:set-claims user@example.com '{"admin":true}'

# Delete from emulator (no confirmation needed)
npx bm firestore:delete users/test123 --emulator
```

## Usage & Rate Limiting

### Overview

Usage is tracked per-metric (e.g., `requests`, `marketing-subscribe`) with two counters:
- `period`: Current month's count, reset on the 1st of each month
- `total`: All-time count, never resets

### Product Rate Limit Modes

Products can set a `rateLimit` field to control how limits are enforced:

| Value | Behavior | Default |
|-------|----------|---------|
| `'monthly'` | Full monthly limit available at any time | Yes |
| `'daily'` | Proportional daily cap: `ceil(limit * dayOfMonth / daysInMonth)` | No |

Example config (not in the template — add per-product as needed):
```json
{
  "id": "basic",
  "limits": { "requests": 100 },
  "rateLimit": "daily"
}
```

With `rateLimit: 'daily'` and 100 requests/month in a 30-day month:
- Day 1: max 4 requests used so far
- Day 15: max 50 requests used so far
- Day 30: max 100 requests (full allocation)

Unused days roll forward — a user who doesn't use the product for 2 weeks can use a burst later.

### Reset Schedule

| Target | Frequency | What happens |
|--------|-----------|-------------|
| Local storage | Daily | Cleared entirely |
| `usage` collection (unauthenticated) | Daily | Deleted entirely |
| User doc `usage.*.period` (authenticated) | Monthly (1st) | Reset to 0 |

The daily cron runs at midnight UTC (`0 0 * * *`). Authenticated user period resets only execute on the 1st of the month.

## Subscription System

### Subscription Statuses

| Status | Meaning | User can delete account? |
|--------|---------|--------------------------|
| `active` | Subscription is current and valid (includes trialing) | No (unless `product.id === 'basic'`) |
| `suspended` | Payment failed (Stripe: `past_due`, `unpaid`) | No |
| `cancelled` | Subscription terminated (Stripe: `canceled`, `incomplete`, `incomplete_expired`) | Yes |

### Stripe Status Mapping

| Stripe Status | `subscription.status` | Notes |
|---|---|---|
| `active` | `active` | Normal active subscription |
| `trialing` | `active` | `trial.claimed = true` |
| `past_due` | `suspended` | Payment failed, retrying |
| `unpaid` | `suspended` | Payment failed |
| `canceled` | `cancelled` | Subscription terminated |
| `incomplete` | `cancelled` | Never completed initial payment |
| `incomplete_expired` | `cancelled` | Expired before completion |
| `active` + `cancel_at_period_end` | `active` | `cancellation.pending = true` |

### Unified Subscription Object (`users/{uid}.subscription`)

```javascript
subscription: {
  product: {
    id: 'basic',                   // product ID from config ('basic', 'premium', etc.)
    name: 'Basic',                 // display name from config
  },
  status: 'active',                // 'active' | 'suspended' | 'cancelled'
  expires: { timestamp, timestampUNIX },
  trial: {
    claimed: false,                // has user EVER used a trial
    expires: { timestamp, timestampUNIX },
  },
  cancellation: {
    pending: false,                // true = cancel at period end
    date: { timestamp, timestampUNIX },
  },
  payment: {
    processor: null,               // 'stripe' | 'paypal' | etc.
    orderId: null,                 // BEM order ID (e.g., '1234-5678-9012')
    resourceId: null,              // provider subscription ID (e.g., 'sub_xxx')
    frequency: null,               // 'monthly' | 'annually'
    price: 0,                      // resolved from config (number, e.g., 4.99)
    startDate: { timestamp, timestampUNIX },
    updatedBy: {
      event: { name: null, id: null },
      date: { timestamp, timestampUNIX },
    },
  },
}
```

### Access Check Patterns

```javascript
// Is premium (paid)?
user.subscription.status === 'active' && user.subscription.product.id !== 'basic'

// Is on trial?
user.subscription.trial.claimed && user.subscription.status === 'active'

// Has pending cancellation?
user.subscription.cancellation.pending === true

// Payment failed?
user.subscription.status === 'suspended'
```

## Payment Transition Handlers

### Overview

When a webhook changes a subscription or processes a one-time payment, BEM detects the state transition and dispatches to a handler file. Handlers are fire-and-forget (non-blocking) — they run after the transition is detected but before or during the Firestore writes. Handler failures never block webhook processing.

Handlers are skipped during tests unless `TEST_EXTENDED_MODE` is set.

### Transition Detection

The `transitions/index.js` module compares the **before** state (current `users/{uid}.subscription`) with the **after** state (new unified subscription) to detect what changed.

### Subscription Transitions

| Transition | Before → After | File |
|---|---|---|
| `new-subscription` | basic/null → active paid | `transitions/subscription/new-subscription.js` |
| `payment-failed` | active → suspended | `transitions/subscription/payment-failed.js` |
| `payment-recovered` | suspended → active | `transitions/subscription/payment-recovered.js` |
| `cancellation-requested` | pending=false → pending=true | `transitions/subscription/cancellation-requested.js` |
| `subscription-cancelled` | non-cancelled → cancelled | `transitions/subscription/subscription-cancelled.js` |
| `plan-changed` | active product A → active product B | `transitions/subscription/plan-changed.js` |

Note: Trials are NOT a separate transition. The `new-subscription` handler checks `after.trial.claimed` to determine if the subscription started with a trial.

### One-Time Transitions

| Transition | Event Type | File |
|---|---|---|
| `purchase-completed` | `checkout.session.completed` | `transitions/one-time/purchase-completed.js` |
| `purchase-failed` | `invoice.payment_failed` | `transitions/one-time/purchase-failed.js` |

### Handler Interface

All handlers are in `src/manager/events/firestore/payments-webhooks/transitions/` and export a single async function:

```javascript
module.exports = async function ({ before, after, uid, userDoc, admin, assistant, Manager, eventType, eventId }) {
  // before: previous subscription state (null for new/one-time)
  // after: new unified state (subscription or one-time)
  // userDoc: full user document data
  // eventType: original webhook event type (e.g., 'customer.subscription.updated')
  // eventId: webhook event ID
};
```

### Creating a New Transition Handler

1. Add detection logic in `transitions/index.js` (in priority order)
2. Create handler file in `transitions/{category}/{name}.js`
3. Handler receives full context — use `assistant.log()` for logging, `Manager.project.apiUrl` for API calls

## Payment System Architecture

### Pipeline

The payment system follows a linear pipeline: **Intent → Webhook → On-Write → Transition**.

1. **Intent** (`POST /payments/intent`): Client requests a payment session. BEM validates the product, generates an order ID (`XXXX-XXXX-XXXX`), and delegates to the processor module (e.g., Stripe creates a Checkout Session). Saves to `payments-intents/{orderId}`.

2. **Webhook** (`POST /payments/webhook?processor=X&key=Y`): Processor sends event data. BEM parses and categorizes the event (`subscription` or `one-time`), extracts the UID, and saves to `payments-webhooks/{eventId}` with `status: 'pending'`.

3. **On-Write** (Firestore trigger on `payments-webhooks/{eventId}`): Fetches the latest resource from the processor API (not stale webhook data), transforms it into a unified object, detects state transitions, dispatches handlers, tracks analytics, and writes to `users/{uid}.subscription` (subscriptions) and `payments-orders/{orderId}`.

4. **Transitions** (fire-and-forget): Handler files run asynchronously after detection. Failures never block webhook processing. Skipped during tests unless `TEST_EXTENDED_MODE` is set.

### 3-Layer Architecture

The payment system is cleanly separated into three independent layers:

| Layer | Purpose | Tests |
|-------|---------|-------|
| **Processor input** (Stripe, PayPal, Test) | Parse raw webhooks + transform to unified shape | Helper tests per processor (`payment/stripe/to-unified-subscription.js`, `payment/paypal/to-unified-one-time.js`, etc.) |
| **Unified pipeline** (processor-agnostic) | Transition detection, Firestore writes, analytics | Journey tests (`journey-payments-*.js`) |
| **Transition handlers** (fire-and-forget) | Emails, notifications, side effects | Skipped during tests unless `TEST_EXTENDED_MODE` |

Each processor transforms its raw data into the **same unified shape**. Once data enters the pipeline, the code doesn't know or care which processor it came from. This means:
- Adding a new processor = implement the processor interface (below). The pipeline handles the rest.
- Journey tests use the `test` processor but exercise the full unified pipeline end-to-end.
- Processor-specific tests only need to verify correct transformation to the unified shape.

### Processor Interface

Each processor implements three modules:

**Intent processor** (`routes/payments/intent/processors/{processor}.js`):
```javascript
module.exports = {
  async createIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, Manager, assistant }) {
    return { id, url, raw };
  },
};
```

**Webhook processor** (`routes/payments/webhook/processors/{processor}.js`):
```javascript
module.exports = {
  isSupported(eventType) { return boolean; },
  parseWebhook(req) { return { eventId, eventType, category, resourceType, resourceId, raw, uid }; },
};
```

**Cancel processor** (`routes/payments/cancel/processors/{processor}.js`):
```javascript
module.exports = {
  async cancelAtPeriodEnd({ resourceId, uid, subscription, assistant }) { /* cancel at end of period */ },
};
```

**Refund processor** (`routes/payments/refund/processors/{processor}.js`):
```javascript
module.exports = {
  async processRefund({ resourceId, uid, subscription, assistant }) {
    return { amount, currency, full };
  },
};
```

**Portal processor** (`routes/payments/portal/processors/{processor}.js`):
```javascript
module.exports = {
  async createPortalSession({ resourceId, uid, returnUrl, assistant }) {
    return { url };
  },
};
```

**Shared library** (`libraries/payment/processors/{processor}.js`):
```javascript
module.exports = {
  init() { /* return SDK instance */ },
  async fetchResource(resourceType, resourceId, rawFallback, context) { /* return resource */ },
  getOrderId(resource) { /* return orderId string or null */ },
  toUnifiedSubscription(rawSubscription, options) { /* return unified object */ },
  toUnifiedOneTime(rawResource, options) { /* return unified object */ },
};
```

### Product Resolution

Products are resolved differently per processor, but always end up matching a product in `config.payment.products`:

| Processor | Resolution chain | Stable ID |
|-----------|-----------------|-----------|
| **Stripe** | `sub.items.data[0].price.product` or `raw.plan.product` → match `product.stripe.productId` or `legacyProductIds` | `prod_xxx` |
| **PayPal** | `sub → plan_id → plan → product_id` → match `product.paypal.productId` | PayPal catalog product ID |
| **Test** | Uses `product.stripe.productId` in Stripe-shaped data | Same as Stripe |

Falls back to `{ id: 'basic' }` if no match found.

### Processor-Specific Details

**Stripe:** Uses `metadata.uid` and `metadata.orderId` on subscriptions for UID/order resolution.

**PayPal:** Uses `custom_id` field on subscriptions with format `uid:{uid},orderId:{orderId}`. Product resolution fetches the plan from the subscription, then gets `product_id` from the plan. Plans are scoped by `product_id` query param to avoid cross-brand matches on shared PayPal accounts.

### Product Configuration

Products are defined in `backend-manager-config.json` under `payment.products`:

```javascript
payment: {
  processors: {
    stripe: { publishableKey: 'pk_live_...' },
    paypal: { clientId: 'ARvf...' },
  },
  products: [
    {
      id: 'basic',           // Free tier (no prices, no processor keys)
      name: 'Basic',
      type: 'subscription',
      limits: { requests: 100 },
    },
    {
      id: 'premium',         // Paid subscription
      name: 'Premium',
      type: 'subscription',
      limits: { requests: 1000 },
      trial: { days: 14 },
      prices: { monthly: 4.99, annually: 49.99 },       // Flat numbers only
      stripe: { productId: 'prod_xxx', legacyProductIds: ['prod_OLD'] },
      paypal: { productId: 'PROD-abc123' },
    },
    {
      id: 'credits-100',     // One-time purchase
      name: '100 Credits',
      type: 'one-time',
      prices: { once: 9.99 },
      stripe: { productId: 'prod_yyy' },
      paypal: { productId: null },
    },
  ],
}
```

Key rules:
- `prices` contains **flat numbers only** — no processor-specific IDs
- Processor IDs live at the product level: `stripe: { productId }`, `paypal: { productId }`
- `stripe.productId` is stable — never changes even when prices change
- `stripe.legacyProductIds` maps old pre-migration Stripe products to this product
- Price IDs (Stripe `price_xxx`, PayPal plan IDs) are **resolved at runtime** by matching amount + interval against active prices on the processor's product
- `basic` product has no `prices` and no processor keys — it's the free tier
- `archived: true` stops offering a product to new subscribers while keeping it resolvable for existing ones

### Firestore Collections

| Collection | Key | Purpose |
|---|---|---|
| `payments-intents/{orderId}` | Order ID | Intent metadata (processor, product, status) |
| `payments-webhooks/{eventId}` | Processor event ID | Webhook processing state + transition result |
| `payments-orders/{orderId}` | Order ID | Unified order data (single source of truth for orders) |
| `users/{uid}.subscription` | User UID | Current subscription state (subscriptions only) |

### Test Processor

The `test` processor generates Stripe-shaped data and auto-fires webhooks to the local server. Only available in non-production environments. Use `processor: 'test'` in intent requests during testing. The test webhook processor delegates to Stripe's parser since it generates Stripe-shaped payloads.

## Common Mistakes to Avoid

1. **Don't modify Manager internals directly** - Use factory methods and public APIs

2. **Always use `assistant.respond()` for responses** - Don't use `res.send()` directly

3. **Match schema names to route names** - If route is `myEndpoint`, schema should be `myEndpoint`

4. **Always await async operations** - Don't forget `await` on Firestore operations

5. **Handle errors properly** - Use `assistant.errorify()` with appropriate status codes

6. **Don't call `respond()` multiple times** - Only one response per request

7. **Use short-circuit returns** - Return early from error conditions

8. **Increment usage before update** - Call `usage.increment()` then `usage.update()`

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
| Main API handler | `src/manager/functions/core/actions/api.js` |
| Config template | `templates/backend-manager-config.json` |
| CLI entry | `src/cli/index.js` |
| Stripe webhook forwarding | `src/cli/commands/stripe.js` |
| Firebase init helper (CLI) | `src/cli/commands/firebase-init.js` |
| Firestore CLI commands | `src/cli/commands/firestore.js` |
| Auth CLI commands | `src/cli/commands/auth.js` |
| Intent creation | `src/manager/routes/payments/intent/post.js` |
| Webhook ingestion | `src/manager/routes/payments/webhook/post.js` |
| Webhook processing (on-write) | `src/manager/events/firestore/payments-webhooks/on-write.js` |
| Payment analytics | `src/manager/events/firestore/payments-webhooks/analytics.js` |
| Transition detection | `src/manager/events/firestore/payments-webhooks/transitions/index.js` |
| Payment processor libraries | `src/manager/libraries/payment/processors/` |
| Stripe library | `src/manager/libraries/payment/processors/stripe.js` |
| PayPal library | `src/manager/libraries/payment/processors/paypal.js` |
| Order ID generator | `src/manager/libraries/payment/order-id.js` |
| Test accounts | `src/test/test-accounts.js` |

## Environment Detection

```javascript
assistant.isDevelopment()  // true when ENVIRONMENT !== 'production' or in emulator
assistant.isProduction()   // true when ENVIRONMENT === 'production'
assistant.isTesting()      // true when running tests (via npx bm test)
```

## Response Headers

BEM automatically sets `bm-properties` header with:
- `code`: HTTP status code
- `tag`: Function name and execution ID
- `usage`: Current usage stats
- `schema`: Resolved schema info
