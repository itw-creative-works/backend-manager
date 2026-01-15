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
      user.js                         # User property structure
      analytics.js                    # GA4 integration
      usage.js                        # Rate limiting
      middleware.js                   # Request pipeline
      settings.js                     # Schema validation
      utilities.js                    # Batch operations
      metadata.js                     # Timestamps/tags
    functions/core/                   # Built-in functions
      actions/
        api.js                        # Main bm_api handler
        api/{category}/{action}.js    # API command handlers
      events/
        auth/                         # Auth event handlers
        firestore/                    # Firestore triggers
      cron/
        daily.js                      # Daily cron runner
        daily/{job}.js                # Individual cron jobs
    routes/                           # Built-in routes
    schemas/                          # Built-in schemas
  cli/
    index.js                          # CLI entry point
    commands/                         # CLI commands
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
npx bm emulators  # Terminal 1 - keeps emulators running
npx bm test       # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulators)
npx bm test
```

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
| User properties | `src/manager/helpers/user.js` |
| Batch utilities | `src/manager/helpers/utilities.js` |
| Main API handler | `src/manager/functions/core/actions/api.js` |
| Config template | `templates/backend-manager-config.json` |
| CLI entry | `src/cli/index.js` |

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
