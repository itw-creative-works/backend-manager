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
      admin/
        post/                         # POST /admin/post - Create blog posts via GitHub
          post.js                     # Extracts images, uploads to GitHub, rewrites body to @post/ format
          put.js                      # PUT /admin/post - Edit existing posts
          templates/
            post.html                 # Post frontmatter template
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

## Sanitization (XSS Prevention)

BEM automatically sanitizes all incoming request data — stripping HTML tags and trimming whitespace from every string field. This happens in the middleware pipeline before route handlers execute, so **routes receive clean data by default**.

### How It Works
1. **Schema fields**: Sanitized per-field during the middleware pipeline. Fields can opt out with `sanitize: false` in the schema.
2. **Non-schema fields** (when `setupSettings: false` or `includeNonSchemaSettings: true`): All strings are sanitized with no opt-out.
3. The middleware uses `Manager.Utilities().sanitize()` under the hood.

### Schema Opt-Out
For fields that legitimately need HTML (rich text, email templates, etc.), set `sanitize: false` in the schema:
```javascript
// This field will NOT be sanitized — raw HTML is preserved
htmlContent: {
  types: ['string'],
  default: '',
  sanitize: false,
},
// This field IS sanitized (default behavior, no flag needed)
name: {
  types: ['string'],
  default: '',
},
```

### Route-Level Opt-Out
Disable sanitization entirely for a route (rare — only for routes that handle raw HTML everywhere):
```javascript
// In functions/index.js
Manager.Middleware(req, res).run('my-route', { sanitize: false });
```

### Manual Sanitization (Outside Middleware)
For cron jobs, event handlers, or anywhere outside the request pipeline, use `utilities.sanitize()` directly:
```javascript
// Available in route context
const clean = utilities.sanitize(untrustedData);

// Or via Manager
const clean = Manager.Utilities().sanitize(untrustedData);
```
Accepts any data type — strings, objects, arrays, primitives. Walks objects/arrays recursively, strips HTML from strings, passes everything else through unchanged.

### Route Handler Context
The middleware injects these into every route handler:
```javascript
module.exports = async ({ Manager, assistant, analytics, usage, user, settings, libraries, utilities }) => {
  // settings    — already sanitized by middleware
  // utilities   — Manager.Utilities() instance for manual sanitization
};
```

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

## Admin Post Route

The `POST /admin/post` route creates blog posts via GitHub's API. It handles image extraction, upload, and body rewriting.

### Image Processing Flow
1. Receives markdown body with external image URLs (e.g., `![alt](https://images.unsplash.com/...)`)
2. Extracts all `![alt](url)` patterns from the body using regex
3. Downloads each image and uploads it to `src/assets/images/blog/post-{id}/` on GitHub
4. **Rewrites the body** to replace external URLs with `@post/{filename}` format
5. The `@post/` prefix is resolved at Jekyll build time by `jekyll-uj-powertools` to the full path

### Key Details
- Image filenames are derived from `hyphenate(alt_text)` + downloaded extension
- Header image (`headerImageURL`) is uploaded but NOT rewritten in the body (it's in frontmatter)
- Failed image downloads are skipped — the original external URL stays in the body
- The `extractImages()` function returns a URL mapping used for body rewriting

### Files
- `src/manager/routes/admin/post/post.js` — POST handler (create)
- `src/manager/routes/admin/post/put.js` — PUT handler (edit)
- `src/manager/routes/admin/post/templates/post.html` — Post template

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
BEM CLI commands automatically save all output to log files in `functions/` while still streaming to the console:
- **`functions/serve.log`** — Output from `npx bm serve` (Firebase serve)
- **`functions/emulator.log`** — Full emulator output (Firebase emulator + Cloud Functions logs)
- **`functions/test.log`** — Test runner output (when running against an existing emulator)
- **`functions/logs.log`** — Cloud Function logs from `npx bm logs:read` or `npx bm logs:tail` (raw JSON for `read`, streaming text for `tail`)

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

### Logs Commands

Fetch or stream Cloud Function logs from Google Cloud Logging. Requires `gcloud` CLI installed and authenticated. Auto-resolves the project ID from `service-account.json`, `.firebaserc`, or `GCLOUD_PROJECT`.

```bash
npx bm logs:read                                     # Read last 1h of logs (default: 50 entries)
npx bm logs:read --fn bm_api                         # Filter by function name
npx bm logs:read --fn bm_api --severity ERROR        # Filter by severity (DEBUG, INFO, WARNING, ERROR, CRITICAL)
npx bm logs:read --since 2d --limit 100              # Custom time range and limit
npx bm logs:tail                                     # Stream live logs
npx bm logs:tail --fn bm_paymentsWebhookOnWrite      # Stream filtered live logs
```

Both commands save output to `functions/logs.log` (overwritten on each run). `logs:read` saves raw JSON; `logs:tail` streams text.

| Flag | Description | Default | Commands |
|------|-------------|---------|----------|
| `--fn <name>` | Filter by Cloud Function name | all | both |
| `--severity <level>` | Minimum severity level | all | both |
| `--since <duration>` | Time range (`30m`, `1h`, `2d`, `1w`) | `1h` | read only |
| `--limit <n>` | Max entries | `50` | read only |
| `--raw` | Output raw JSON | false | both |

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

Usage is tracked per-metric (e.g., `requests`, `sponsorships`) with four fields:
- `monthly`: Current month's count, reset on the 1st of each month by cron
- `daily`: Current day's count, reset every day by cron
- `total`: All-time count, never resets
- `last`: Object with `id`, `timestamp`, `timestampUNIX` of the last usage event

### Limits & Daily Caps

Limits are always specified as **monthly** values in product config (e.g., `limits.requests = 100` means 100/month).

By default, limits are enforced with **daily caps** to prevent users from burning their entire monthly quota in a single day. Two checks are applied:

1. **Flat daily cap**: `ceil(monthlyLimit / daysInMonth)` — max uses per day
   - e.g., 100/month in a 31-day month = `ceil(100/31)` = 4/day
2. **Proportional monthly cap**: `ceil(monthlyLimit * dayOfMonth / daysInMonth)` — running total
   - Prevents accumulating too much too fast even within daily limits
   - e.g., Day 15 of a 30-day month with 100/month limit = max 50 used so far

Products can opt out of daily caps by setting `rateLimit: 'monthly'` (default is `'daily'`):
```json
{
  "id": "basic",
  "limits": { "requests": 100 },
  "rateLimit": "monthly"
}
```

### Proxy Usage (setUser + Mirrors)

Sometimes usage must be billed to a different user than the one making the request (e.g., anonymous visitors consuming an agent owner's credits). Use `setUser()` to swap the target and `addMirror()` / `setMirrors()` to write usage to additional Firestore docs:

```js
// Switch usage target to the agent owner (fetches their user doc)
await usage.setUser(ownerUid);

// Also write usage data to the agent doc
usage.addMirror(`agents/${agentId}`);

// Now validate, increment, and update all operate on the owner's data
// update() writes to users/{ownerUid} AND agents/{agentId} in parallel
await usage.validate('credits');
usage.increment('credits');
await usage.update();
```

**Methods:**
- `setUser(uid)` — async, fetches `users/{uid}` from Firestore, replaces `self.user`, sets `useUnauthenticatedStorage = false`
- `setMirrors(paths)` — sync, overwrites the mirror array with the given paths
- `addMirror(path)` — sync, appends a single path to the mirror array

Mirrors are write-only — `update()` writes `{ usage: self.user.usage }` (merge) to each mirror path. No reads are performed on mirrors.

### Reset Schedule

| Target | Frequency | What happens |
|--------|-----------|-------------|
| Local storage | Daily | Cleared entirely |
| `usage` collection (unauthenticated) | Daily | Deleted entirely |
| User doc `usage.*.daily` (authenticated) | Daily | Reset to 0 |
| User doc `usage.*.monthly` (authenticated) | Monthly (1st) | Reset to 0 |

The daily cron (`reset-usage.js`) runs at midnight UTC. It collects all users with non-zero counters across all metrics, then performs a single write per user to reset daily (and monthly on the 1st).

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
    frequency: null,               // 'monthly' | 'annually' | 'weekly' | 'daily'
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

### resolveSubscription(account)

`User.resolveSubscription(account)` is a static method on the User helper that derives calculated subscription fields from raw account data. It returns only fields that require derivation logic — raw data (product.id, status, trial, cancellation) lives on the account object directly.

```javascript
const User = require('backend-manager/src/manager/helpers/user');

const resolved = User.resolveSubscription(account);
// Returns: { plan, active, trialing, cancelling }
```

| Field | Type | Description |
|-------|------|-------------|
| `plan` | `string` | Effective plan ID the user has access to RIGHT NOW (`'basic'` if cancelled/suspended) |
| `active` | `boolean` | User has active access (active, trialing, or cancelling) |
| `trialing` | `boolean` | In an active trial (status `'active'` + `trial.claimed` + unexpired `trial.expires`) |
| `cancelling` | `boolean` | Cancellation pending (status `'active'` + `cancellation.pending` + NOT trialing) |

Accepts either a raw Firestore account object or a resolved `User` instance (checks both `account.subscription` and `account.properties.subscription`).

**Unified with web-manager**: The same function exists as `auth.resolveSubscription(account)` in web-manager (`modules/auth.js`) with identical logic and return shape.

**Use this instead of manual access checks** — it centralizes all the derivation logic in one place:
```javascript
// ✅ PREFERRED — use resolveSubscription
const resolved = User.resolveSubscription(user);
if (resolved.active) { /* has access */ }

// ❌ AVOID — manual checks that duplicate logic
if (user.subscription.status === 'active' && user.subscription.product.id !== 'basic') { /* ... */ }
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
      prices: { monthly: 4.99, annually: 49.99 },       // Flat numbers; also supports 'weekly' and 'daily'
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

## Marketing Custom Fields

BEM syncs user data to marketing providers (SendGrid, Beehiiv) as custom fields. Field definitions live in a single dictionary; OMEGA provisions them in each provider.

### Adding a New Field

1. Add the field to `FIELDS` in `src/manager/libraries/email/constants.js` — the key IS the field name in both providers. Set `source`, `path`, `type`.
2. Add matching entry in OMEGA's `src/lib/bem-fields.js` with `name`, `display`, `type`. If Beehiiv has it built-in (e.g., country, utm_source), set `beehiivBuiltIn: true`.
3. Run OMEGA: `npm start -- --service=sendgrid,beehiiv --brand=X`
4. BEM resolves field IDs at runtime — no provider code changes needed.

### How It Works

- **SendGrid**: `resolveFieldIds()` fetches field definitions from the SendGrid API, builds a name-to-ID cache, and maps values to SendGrid's auto-generated IDs (e.g., `brand_id` maps to `e35_T`).
- **Beehiiv**: BEM uses the key directly as the custom field name — no ID resolution needed.
- **OMEGA**: The `ensure/custom-fields.js` handlers are idempotent — they fetch existing fields and only create what is missing.

### Key Files

| Purpose | File |
|---------|------|
| Field dictionary (BEM SSOT) | `src/manager/libraries/email/constants.js` |
| Field provisioning list (OMEGA SSOT) | `omega-manager/src/lib/bem-fields.js` |
| SendGrid provisioning | `omega-manager/src/services/sendgrid/ensure/custom-fields.js` |
| Beehiiv provisioning | `omega-manager/src/services/beehiiv/ensure/custom-fields.js` |

## Marketing Campaign System

### Campaign CRUD Routes (admin-only)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/marketing/campaign` | Create campaign (immediate or scheduled) |
| GET | `/marketing/campaign` | List/filter campaigns by date range, status, type |
| PUT | `/marketing/campaign` | Update pending campaigns (reschedule, edit) |
| DELETE | `/marketing/campaign` | Delete pending campaigns |

### Firestore Collection: `marketing-campaigns/{id}`

```javascript
{
  settings: { name, subject, preheader, content, template, sender, segments, excludeSegments, ... },
  sendAt: 1743465600,        // Unix timestamp (any format accepted, normalized on create)
  status: 'pending',         // pending | sent | failed
  type: 'email',             // email | push
  recurrence: { pattern, hour, day },  // Optional — makes it recurring
  generator: 'newsletter',   // Optional — runs content generator before sending
  recurringId: '_recurring-sale',      // Present on history docs (links to parent template)
  generatedFrom: '_recurring-newsletter', // Present on generated docs
  results: { sendgrid: {...}, beehiiv: {...} },
  metadata: { created: {...}, updated: {...} },
}
```

### Campaign Types

- **Email**: dispatches to SendGrid (Single Send) + Beehiiv (Post) via `mailer.sendCampaign()`
- **Push**: dispatches to FCM via `notification.send()` (shared library)
- Content is **markdown** — converted to HTML at send time. Template variables resolved before conversion.

### Recurring Campaigns

Campaigns with a `recurrence` field repeat automatically:
- Cron fires → creates a **history doc** (same collection, `recurringId` set) → advances `sendAt` to next occurrence
- Status stays `pending` on the recurring template, history docs are `sent`/`failed`
- `_` prefix on IDs groups them at top of Firestore console

Recurrence patterns: `daily`, `weekly`, `monthly`, `quarterly`, `yearly`

### Generator Campaigns

Campaigns with a `generator` field don't send directly. A daily cron pre-generates content 24 hours before `sendAt`:
1. Daily cron finds generator campaigns due within 24 hours
2. Runs the generator module (e.g., `generators/newsletter.js`)
3. Creates a NEW standalone `pending` campaign with generated content
4. Advances the recurring template's `sendAt`
5. Generated campaign appears on calendar for review, sent by frequent cron when due

### Template Variables

Resolved at send time via `powertools.template()`. Single braces `{var}` for campaign-level, double `{{var}}` for SendGrid template-level.

| Variable | Example Output |
|----------|---------------|
| `{brand.name}` | Somiibo |
| `{brand.id}` | somiibo |
| `{brand.url}` | https://somiibo.com |
| `{season.name}` | Winter, Spring, Summer, Fall |
| `{holiday.name}` | Black Friday, Christmas, Valentine's Day, etc. |
| `{date.month}` | November |
| `{date.year}` | 2026 |
| `{date.full}` | March 17, 2026 |

### UTM Auto-Tagging

`libraries/email/utm.js` scans HTML for `<a href>` matching the brand's domain and appends UTM params. Applied to both marketing campaigns and transactional emails.

Defaults: `utm_source=brand.id`, `utm_medium=email`, `utm_campaign=name`, `utm_content=type`. Override via `settings.utm` object.

### Segments SSOT

`SEGMENTS` dictionary in `constants.js` — 22 segment definitions. OMEGA creates them in SendGrid, BEM resolves keys to provider IDs at runtime via `resolveSegmentIds()` (cached).

| Category | Segments |
|----------|----------|
| Subscription (9) | `subscription_free`, `subscription_paid`, `subscription_trialing`, `subscription_cancelling`, `subscription_suspended`, `subscription_cancelled`, `subscription_churned`, `subscription_ever_paid`, `subscription_never_paid` |
| Lifecycle (5) | `lifecycle_7d`, `lifecycle_30d`, `lifecycle_90d`, `lifecycle_6m`, `lifecycle_1y` |
| Engagement (5) | `engagement_active_30d`, `engagement_active_90d`, `engagement_inactive_90d`, `engagement_inactive_5m`, `engagement_inactive_6m` |

Campaigns reference segments by SSOT key: `segments: ['subscription_free']`. Auto-translated to provider IDs.

### Contact Pruning

`cron/daily/marketing-prune.js` — runs 1st of each month. Two stages:
1. **Re-engagement**: send email to `engagement_inactive_5m` (excluding `engagement_inactive_6m`)
2. **Prune**: export `engagement_inactive_6m` contacts, bulk delete from SendGrid + Beehiiv. Never prunes paying customers.

### Newsletter Generator

`generators/newsletter.js` — pulls content from parent server, AI assembles branded newsletter.
1. Fetch sources: `GET {parentUrl}/newsletter/sources?category=X&claimFor=brandId` (atomic claim)
2. AI assembly: GPT-4o-mini generates subject, preheader, and markdown content
3. Mark used: `PUT {parentUrl}/newsletter/sources` per source

### Seed Campaigns

Created by `npx bm setup` (idempotent, enforced fields checked every run):

| ID | Type | Description |
|----|------|-------------|
| `_recurring-sale` | email (sendgrid) | Seasonal sale targeting free + cancelled + churned users |
| `_recurring-newsletter` | email (beehiiv) | AI-generated newsletter from parent server sources |

### Marketing Config

```javascript
marketing: {
  sendgrid: { enabled: true },
  beehiiv: { enabled: false, publicationId: 'pub_xxxxx' },
  prune: { enabled: true },
  newsletter: { enabled: false, categories: ['social-media', 'marketing'] },
}
```

### Key Marketing Files

| Purpose | File |
|---------|------|
| Marketing library | `src/manager/libraries/email/marketing/index.js` |
| Field + segment SSOT | `src/manager/libraries/email/constants.js` |
| UTM tagging | `src/manager/libraries/email/utm.js` |
| Newsletter generator | `src/manager/libraries/email/generators/newsletter.js` |
| Notification library | `src/manager/libraries/notification.js` |
| SendGrid provider | `src/manager/libraries/email/providers/sendgrid.js` |
| Beehiiv provider | `src/manager/libraries/email/providers/beehiiv.js` |
| Campaign routes | `src/manager/routes/marketing/campaign/{get,post,put,delete}.js` |
| Campaign cron | `src/manager/cron/frequent/marketing-campaigns.js` |
| Newsletter pre-gen cron | `src/manager/cron/daily/marketing-newsletter-generate.js` |
| Pruning cron | `src/manager/cron/daily/marketing-prune.js` |
| Seed campaigns | `src/cli/commands/setup-tests/helpers/seed-campaigns.js` |

## Common Mistakes to Avoid

1. **Don't modify Manager internals directly** - Use factory methods and public APIs

2. **Always use `assistant.respond()` for responses** - Don't use `res.send()` directly

3. **Match schema names to route names** - If route is `myEndpoint`, schema should be `myEndpoint`

4. **Always await async operations** - Don't forget `await` on Firestore operations

5. **Handle errors properly** - Use `assistant.errorify()` with appropriate status codes

6. **Don't call `respond()` multiple times** - Only one response per request

7. **Use short-circuit returns** - Return early from error conditions

8. **Increment usage before update** - Call `usage.increment()` then `usage.update()`

9. **Add Firestore composite indexes for new compound queries** - Any new Firestore query using multiple `.where()` clauses or `.where()` + `.orderBy()` requires a composite index. Add it to `src/cli/commands/setup-tests/helpers/required-indexes.js` (the SSOT). Consumer projects pick these up via `npx bm setup`, which syncs them into `firestore.indexes.json`. Without the index, the query will crash with `FAILED_PRECONDITION` in production.

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

## Environment Detection

```javascript
assistant.isDevelopment()  // true when ENVIRONMENT !== 'production' or in emulator
assistant.isProduction()   // true when ENVIRONMENT === 'production'
assistant.isTesting()      // true when running tests (via npx bm test)
```

## Model Context Protocol (MCP)

BEM includes a built-in MCP server that exposes BEM routes as tools for Claude Chat, Claude Code, and other MCP clients.

### Architecture

Two transport modes:
- **Stdio** (local): `npx bm mcp` — for Claude Code / Claude Desktop
- **Streamable HTTP** (remote): `POST /backend-manager/mcp` — for Claude Chat (stateless, Firebase Functions compatible)

### Available Tools (19)

| Tool | Route | Description |
|------|-------|-------------|
| `firestore_read` | `GET /admin/firestore` | Read a Firestore document by path |
| `firestore_write` | `POST /admin/firestore` | Write/merge a Firestore document |
| `firestore_query` | `POST /admin/firestore/query` | Query a collection with where/orderBy/limit |
| `send_email` | `POST /admin/email` | Send transactional email via SendGrid |
| `send_notification` | `POST /admin/notification` | Send push notification via FCM |
| `get_user` | `GET /user` | Get authenticated user info |
| `get_subscription` | `GET /user/subscription` | Get subscription info for a user |
| `sync_users` | `POST /admin/users/sync` | Sync user data across systems |
| `list_campaigns` | `GET /marketing/campaign` | List marketing campaigns |
| `create_campaign` | `POST /marketing/campaign` | Create a marketing campaign |
| `get_stats` | `GET /admin/stats` | Get system statistics |
| `cancel_subscription` | `POST /payments/cancel` | Cancel subscription at period end |
| `refund_payment` | `POST /payments/refund` | Process a refund |
| `run_cron` | `POST /admin/cron` | Trigger a cron job by ID |
| `create_post` | `POST /admin/post` | Create a blog post |
| `create_backup` | `POST /admin/backup` | Create a Firestore backup |
| `run_hook` | `POST /admin/hook` | Execute a custom hook |
| `generate_uuid` | `POST /general/uuid` | Generate a UUID |
| `health_check` | `GET /test/health` | Check server health |

### Authentication

- **Stdio (local):** Reads `BACKEND_MANAGER_KEY` from `functions/.env` automatically
- **HTTP (remote):** OAuth 2.1 Authorization Code flow with PKCE. Claude Chat handles the flow — user pastes BEM key once on the authorize page. If `OAuth Client ID` is set to the BEM key in the connector config, the authorize step auto-approves.

### Hosting Rewrites

The `npx bm setup` command automatically adds required Firebase Hosting rewrites for MCP OAuth:
```json
{
  "source": "{/backend-manager,/backend-manager/**,/.well-known/oauth-protected-resource,/.well-known/oauth-authorization-server,/authorize,/token}",
  "function": "bm_api"
}
```

### CLI Usage

```bash
npx bm mcp                    # Start stdio MCP server (for Claude Code)
```

### Claude Code Configuration

Add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "backend-manager": {
      "command": "npx",
      "args": ["bm", "mcp"],
      "cwd": "/path/to/consumer-project"
    }
  }
}
```

### Claude Chat Configuration

1. Go to Settings → Custom Connectors → Add
2. **URL:** `https://api.yourdomain.com/backend-manager/mcp`
3. **OAuth Client ID:** your `BACKEND_MANAGER_KEY` (enables auto-approve)
4. **OAuth Client Secret:** your `BACKEND_MANAGER_KEY`

### Key Files

| Purpose | File |
|---------|------|
| Tool definitions | `src/mcp/tools.js` |
| HTTP handler (stateless + OAuth) | `src/mcp/handler.js` |
| Stdio server | `src/mcp/index.js` |
| HTTP client | `src/mcp/client.js` |
| CLI command | `src/cli/commands/mcp.js` |
| MCP route interception | `src/manager/index.js` (`_handleMcp`, `resolveMcpRoutePath`) |
| Hosting rewrites setup | `src/cli/commands/setup-tests/hosting-rewrites.js` |

### Adding New Tools

1. Add the tool definition to `src/mcp/tools.js` with `name`, `description`, `method`, `path`, and `inputSchema`
2. The tool automatically maps to the corresponding BEM route via the HTTP client — no handler code needed

## Response Headers

BEM automatically sets `bm-properties` header with:
- `code`: HTTP status code
- `tag`: Function name and execution ID
- `usage`: Current usage stats
- `schema`: Resolved schema info
