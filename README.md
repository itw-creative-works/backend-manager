<p align="center">
  <a href="https://itwcreativeworks.com">
    <img src="https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/logo/itw-creative-works-brandmark-black-x.svg" width="100px">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/itw-creative-works/backend-manager.svg">
  <br>
  <img src="https://img.shields.io/librariesio/release/npm/backend-manager.svg">
  <img src="https://img.shields.io/bundlephobia/min/backend-manager.svg">
  <img src="https://img.shields.io/codeclimate/maintainability-percentage/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/npm/dm/backend-manager.svg">
  <img src="https://img.shields.io/node/v/backend-manager.svg">
  <img src="https://img.shields.io/website/https/itwcreativeworks.com.svg">
  <img src="https://img.shields.io/github/license/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/github/contributors/itw-creative-works/backend-manager.svg">
  <img src="https://img.shields.io/github/last-commit/itw-creative-works/backend-manager.svg">
  <br>
  <br>
  <a href="https://itwcreativeworks.com">Site</a> | <a href="https://www.npmjs.com/package/backend-manager">NPM Module</a> | <a href="https://github.com/itw-creative-works/backend-manager">GitHub Repo</a>
  <br>
  <br>
  <strong>Backend Manager (BEM)</strong> is an NPM module for Firebase developers that instantly implements powerful backend features including authentication, rate limiting, analytics, and more.
</p>

## Installation

```bash
npm install backend-manager
```

**Requirements:**
- Node.js 22
- Firebase project with Firestore and Authentication enabled
- `service-account.json` - Firebase service account credentials
- `backend-manager-config.json` - BEM configuration file

## Quick Start

Create `functions/index.js`:

```javascript
const Manager = (new (require('backend-manager'))).init(exports, {
  setupFunctionsIdentity: true,
});
const { functions } = Manager.libraries;

// Create a custom function
exports.myEndpoint = functions
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .https.onRequest((req, res) => Manager.Middleware(req, res).run('myEndpoint', { /* options */ }));
```

Create `functions/routes/myEndpoint/index.js`:

```javascript
function Route() {}

Route.prototype.main = async function (assistant) {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

  assistant.log('Request data:', assistant.request.data);

  // Return response
  assistant.respond({ success: true, timestamp: new Date().toISOString() });
};

module.exports = Route;
```

Create `functions/schemas/myEndpoint/index.js`:

```javascript
module.exports = function (assistant) {
  return {
    defaults: {
      message: {
        types: ['string'],
        default: 'Hello World',
      },
    },
  };
};
```

Run the setup command:

```bash
npx bm setup
```

## Initialization Options

```javascript
const Manager = (new (require('backend-manager'))).init(exports, options);
```

| Option | Default | Description |
|--------|---------|-------------|
| `initialize` | `true` | Initialize Firebase Admin SDK |
| `projectType` | `'firebase'` | `'firebase'` for Cloud Functions, `'custom'` for Express server |
| `setupFunctions` | `true` | Setup built-in Cloud Functions (`bm_api`, etc.) |
| `setupFunctionsIdentity` | `true` | Setup auth event functions (onCreate, onDelete, beforeCreate, beforeSignIn) |
| `setupFunctionsLegacy` | `false` | Setup legacy admin functions |
| `setupServer` | `true` | Setup custom Express server for routes |
| `routes` | `'/routes'` | Directory for custom route handlers |
| `schemas` | `'/schemas'` | Directory for schema definitions |
| `resourceZone` | `'us-central1'` | Firebase/GCP region |
| `sentry` | `true` | Enable Sentry error tracking |
| `serviceAccountPath` | `'service-account.json'` | Path to Firebase service account |
| `backendManagerConfigPath` | `'backend-manager-config.json'` | Path to BEM config file |
| `initializeLocalStorage` | `false` | Initialize local lowdb storage on startup |
| `checkNodeVersion` | `true` | Validate Node.js version on startup |
| `express.bodyParser.json` | `{ limit: '100kb' }` | Express JSON body parser options |
| `express.bodyParser.urlencoded` | `{ limit: '100kb', extended: true }` | Express URL-encoded options |

## Configuration File

Create `backend-manager-config.json` in your functions directory:

```json5
{
  brand: {
    id: 'my-app',
    name: 'My Brand',
    url: 'https://example.com',
    contact: {
      email: 'support@example.com',
    },
    images: {
      wordmark: 'https://example.com/wordmark.png',
      brandmark: 'https://example.com/brandmark.png',
      combomark: 'https://example.com/combomark.png',
    },
  },
  sentry: {
    dsn: 'https://xxx@xxx.ingest.sentry.io/xxx',
  },
  google_analytics: {
    id: 'G-XXXXXXXXXX',
    secret: 'your-ga4-secret',
  },
  backend_manager: {
    key: 'your-admin-key',
    namespace: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  firebaseConfig: {
    apiKey: 'xxx',
    authDomain: 'project-id.firebaseapp.com',
    projectId: 'project-id',
    storageBucket: 'project-id.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123:web:456',
    measurementId: 'G-XXXXXXXXXX',
  },
}
```

## Creating Custom Functions

### Routes

Routes handle HTTP requests. Create files in your `routes/` directory:

**Structure:**
- `routes/{name}/index.js` - Handles all HTTP methods
- `routes/{name}/get.js` - Handles GET requests only
- `routes/{name}/post.js` - Handles POST requests only
- (also supports `put.js`, `delete.js`, `patch.js`)

**Route File Pattern:**

```javascript
function Route() {}

Route.prototype.main = async function (assistant) {
  // Access Manager and helpers
  const Manager = assistant.Manager;
  const usage = assistant.usage;
  const user = assistant.usage.user;
  const analytics = assistant.analytics;
  const settings = assistant.settings;

  // Access request data
  const data = assistant.request.data;       // Merged body + query
  const body = assistant.request.body;       // POST body
  const query = assistant.request.query;     // Query params
  const headers = assistant.request.headers;
  const method = assistant.request.method;
  const geolocation = assistant.request.geolocation; // { ip, country, region, city, latitude, longitude }
  const client = assistant.request.client;   // { userAgent, language, platform, mobile }

  // Check authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Check admin role
  if (!user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Track analytics
  analytics.event('my_event', { action: 'test' });

  // Validate usage limits
  await usage.validate('requests');
  usage.increment('requests');
  await usage.update();

  // Send response
  assistant.respond({ success: true, data: settings });
};

module.exports = Route;
```

### Schemas

Schemas define and validate request parameters with defaults and plan-based limits:

```javascript
module.exports = function (assistant, settings, options) {
  const user = options.user;

  return {
    // Default values for all plans
    defaults: {
      message: {
        types: ['string'],
        default: 'Hello',
        required: false,
      },
      count: {
        types: ['number'],
        default: 10,
        min: 1,
        max: 100,
      },
      format: {
        types: ['string'],
        default: 'json',
        // Dynamic required based on other settings
        required: (assistant, settings) => settings.output === 'file',
        // Clean/sanitize input
        clean: (value) => value.toLowerCase().trim(),
      },
    },

    // Override defaults for premium plan
    premium: {
      count: {
        types: ['number'],
        default: 100,
        max: 1000,
      },
    },
  };
};
```

**Schema Property Options:**

| Property | Type | Description |
|----------|------|-------------|
| `types` | `string[]` | Allowed types: `'string'`, `'number'`, `'boolean'`, `'object'`, `'array'` |
| `default` | `any` | Default value if not provided |
| `required` | `boolean \| function` | Whether the field is required |
| `clean` | `RegExp \| function` | Sanitize/transform the value |
| `min` | `number` | Minimum value (for numbers) |
| `max` | `number` | Maximum value (for numbers) |
| `available` | `boolean` | Whether the field is available |

### Middleware Options

```javascript
Manager.Middleware(req, res).run('routeName', {
  authenticate: true,           // Authenticate user (default: true)
  setupAnalytics: true,         // Initialize analytics (default: true)
  setupUsage: true,             // Initialize usage tracking (default: true)
  setupSettings: true,          // Resolve settings from schema (default: true)
  schema: 'routeName',          // Schema file to use (default: same as route)
  parseMultipartFormData: true, // Parse multipart uploads (default: true)
  routesDir: '/routes',         // Custom routes directory
  schemasDir: '/schemas',       // Custom schemas directory
});
```

## Hook System

Intercept and modify `bm_api` requests before/after processing:

```javascript
const Manager = (new (require('backend-manager'))).init(exports, {});

Manager.handlers.bm_api = function (mod, position) {
  const assistant = mod.assistant;

  return new Promise(async function(resolve, reject) {
    const command = mod.assistant.request.data.command || '';
    const payload = mod.assistant.request.data.payload || {};

    assistant.log('Intercepted bm_api', position, command, payload);

    // Handle specific commands
    if (command === 'user:sign-up') {
      if (position === 'pre') {
        // Before sign-up: validate, modify payload, etc.
        assistant.log('Pre sign-up hook');
      } else if (position === 'post') {
        // After sign-up: send notifications, etc.
        assistant.log('Post sign-up hook');
      }
    }

    // Handle all commands
    if (command === '*') {
      if (position === 'pre') {
        // Before any command
      } else if (position === 'post') {
        // After any command
      }
    }

    return resolve();
  });
};
```

## Built-in Functions

### HTTP API (`bm_api`)

The main API endpoint accepts commands in the format `category:action`:

```javascript
// POST to https://us-central1-{project}.cloudfunctions.net/bm_api
{
  "command": "general:generate-uuid",
  "payload": {
    "version": "4"
  },
  "apiKey": "optional-api-key"
}
```

**Available Commands:**

| Category | Commands |
|----------|----------|
| `admin` | `firestore-write`, `firestore-read`, `firestore-query`, `database-write`, `database-read`, `send-email`, `send-notification`, `payment-processor`, `backup`, `cron`, `create-post`, `edit-post`, `get-stats`, `run-hook`, `sync-users`, `write-repo-content` |
| `user` | `sign-up`, `delete`, `oauth2`, `resolve`, `get-subscription-info`, `get-active-sessions`, `sign-out-all-sessions`, `create-custom-token`, `regenerate-api-keys`, `submit-feedback`, `validate-settings` |
| `general` | `generate-uuid`, `send-email`, `fetch-post` |
| `handler` | `create-post` |
| `firebase` | `get-providers` |
| `test` | `authenticate`, `webhook`, `lab`, `redirect` |
| `special` | `setup-electron-manager-client` |

### Auth Events

| Function | Trigger | Description |
|----------|---------|-------------|
| `bm_authBeforeCreate` | `beforeUserCreated` | Runs before user creation, can block signup |
| `bm_authBeforeSignIn` | `beforeUserSignedIn` | Runs before sign-in, can block login |
| `bm_authOnCreate` | `onCreate` | Runs after user creation, creates user document |
| `bm_authOnDelete` | `onDelete` | Runs when user is deleted, cleanup |

### Firestore Events

| Function | Trigger | Description |
|----------|---------|-------------|
| `bm_notificationsOnWrite` | `onWrite` | Triggers on `notifications/{id}` changes |

### Cron Jobs

| Function | Schedule | Description |
|----------|----------|-------------|
| `bm_cronDaily` | Every 24 hours | Runs daily jobs from `cron/daily/` and `hooks/cron/daily/` |

**Creating Custom Cron Jobs:**

Create `hooks/cron/daily/myJob.js` in your functions directory:

```javascript
function Job() {}

Job.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    assistant.log('Running my daily job...');

    // Your job logic here

    return resolve();
  });
};

module.exports = Job;
```

## Helper Classes

### Assistant

Handles request/response lifecycle, authentication, and logging.

```javascript
const assistant = Manager.Assistant({ req, res });

// Authentication
const user = await assistant.authenticate();
// Returns: { authenticated, auth: { uid, email }, roles, plan, ... }

// Request data
assistant.request.data;        // Merged body + query
assistant.request.body;        // POST body
assistant.request.query;       // Query params
assistant.request.headers;     // Request headers
assistant.request.method;      // HTTP method
assistant.request.geolocation; // { ip, country, region, city, latitude, longitude }
assistant.request.client;      // { userAgent, language, platform, mobile }

// Response
assistant.respond({ success: true });              // 200 JSON
assistant.respond({ success: true }, { code: 201 }); // Custom status
assistant.respond('https://example.com', { code: 302 }); // Redirect

// Errors
assistant.errorify('Something went wrong', { code: 500, sentry: true });
assistant.respond(new Error('Bad request'), { code: 400 });

// Logging
assistant.log('Info message');
assistant.warn('Warning message');
assistant.error('Error message');
assistant.debug('Debug message');

// Environment
assistant.isDevelopment(); // true in emulator
assistant.isProduction();  // true in production
assistant.isTesting();     // true when running tests

// File uploads
const { fields, files } = await assistant.parseMultipartFormData();
```

### User

Creates user objects with default properties:

```javascript
const userProps = Manager.User(existingData, { defaults: true }).properties;

// User structure:
{
  auth: { uid, email, temporary },
  plan: {
    id: 'basic',           // basic | advanced | premium
    status: 'active',      // active | suspended | cancelled
    expires: { timestamp, timestampUNIX },
    trial: { activated, expires: {...} },
    limits: {},
    payment: { processor, orderId, resourceId, frequency, active, startDate, updatedBy }
  },
  roles: { admin, betaTester, developer },
  affiliate: { code, referrals, referrer },
  activity: { lastActivity, created, geolocation, client },
  api: { clientId, privateKey },
  usage: { requests: { period, total, last } },
  personal: { birthday, gender, location, name, company, telephone },
  oauth2: {}
}

// Methods
userProps.resolve();           // Check plan expiration
userProps.merge(otherUser);    // Merge with another user object
```

### Analytics

Send events to Google Analytics 4:

```javascript
const analytics = Manager.Analytics({
  assistant: assistant,
  uuid: user.auth.uid,
});

analytics.event('purchase', {
  item_id: 'product-123',
  value: 29.99,
  currency: 'USD',
});
```

**Auto-tracked User Properties:**
- `app_version`, `device_category`, `operating_system`, `platform`
- `authenticated`, `plan_id`, `plan_trial_activated`, `activity_created`
- `country`, `city`, `language`, `age`, `gender`

### Usage

Track and limit API usage:

```javascript
const usage = await Manager.Usage().init(assistant, {
  app: 'my-app',                    // App ID for limits
  key: 'custom-key',                // Optional custom key (default: user UID or IP)
  whitelistKeys: ['admin-key'],     // Keys that bypass limits
  unauthenticatedMode: 'firestore', // 'firestore' or 'local'
  refetch: false,                   // Force refetch app limits
  log: true,                        // Enable logging
});

// Check and validate limits
const currentUsage = usage.getUsage('requests');  // Get current period usage
const limit = usage.getLimit('requests');         // Get plan limit
await usage.validate('requests');                 // Throws if over limit

// Increment usage
usage.increment('requests', 1);
usage.set('requests', 0);  // Reset to specific value

// Save to Firestore
await usage.update();

// Whitelist keys
usage.addWhitelistKeys(['another-key']);
```

### Middleware

Process requests through the middleware pipeline:

```javascript
// In your function definition
exports.myEndpoint = functions
  .https.onRequest((req, res) => Manager.Middleware(req, res).run('myEndpoint', {
    authenticate: true,
    setupAnalytics: true,
    setupUsage: true,
    setupSettings: true,
    schema: 'myEndpoint',
  }));
```

The middleware automatically:
1. Parses multipart form data
2. Logs request details
3. Loads route handler (method-specific or index.js)
4. Authenticates user
5. Initializes usage tracking
6. Sets up analytics
7. Resolves settings from schema
8. Calls your route handler

### Settings

Resolve and validate request settings against a schema:

```javascript
const settings = Manager.Settings().resolve(assistant, schema, inputSettings, {
  dir: '/schemas',
  schema: 'mySchema',
  user: user,
  checkRequired: true,
});

// Timestamp constants
const timestamp = Manager.Settings().constant('timestamp');
// { types: ['string'], value: undefined, default: '2024-01-01T00:00:00.000Z' }

const timestampUNIX = Manager.Settings().constant('timestampUNIX');
// { types: ['number'], value: undefined, default: 1704067200 }

const timestampFULL = Manager.Settings().constant('timestampFULL');
// { timestamp: {...}, timestampUNIX: {...} }
```

### Utilities

Batch operations and helper functions:

```javascript
const utilities = Manager.Utilities();

// Batch iterate Firestore collection
const results = await utilities.iterateCollection(
  async ({ docs }, batch, totalCount) => {
    for (const doc of docs) {
      // Process each document
    }
    return { processed: docs.length };
  },
  {
    collection: 'users',
    batchSize: 1000,
    maxBatches: 10,
    where: [{ field: 'plan.id', operator: '==', value: 'premium' }],
    orderBy: { field: 'activity.created.timestamp', direction: 'desc' },
    startAfter: 'lastDocId',
    log: true,
  }
);

// Batch iterate Firebase Auth users
await utilities.iterateUsers(
  async ({ users, pageToken }, batch) => {
    for (const user of users) {
      // Process each auth user
    }
  },
  {
    batchSize: 1000,
    maxBatches: Infinity,
    log: true,
  }
);

// Get document with owner user
const { document, user } = await utilities.getDocumentWithOwnerUser('posts/abc123', {
  owner: 'owner.uid',
  resolve: {
    schema: 'posts',
    assistant: assistant,
    checkRequired: false,
  },
});

// Generate random ID
const id = utilities.randomId({ size: 14 }); // 'A1b2C3d4E5f6G7'

// Cached Firestore read
const doc = await utilities.get('users/abc123', {
  maxAge: 1000 * 60 * 5, // 5 minute cache
  format: 'data',        // 'raw' or 'data'
});
```

### Metadata

Add timestamps and tags to documents:

```javascript
const metadata = Manager.Metadata(document);

document.metadata = metadata.set({ tag: 'my-operation' });
// {
//   updated: { timestamp: '...', timestampUNIX: ... },
//   tag: 'my-operation'
// }
```

### Local Storage

Persistent JSON storage using lowdb:

```javascript
const storage = Manager.storage({
  name: 'myStorage',     // Storage name (default: 'main')
  temporary: false,      // Use OS temp directory (default: false)
  clear: true,           // Clear on dev startup (default: true)
  log: false,            // Enable logging
});

// lowdb API
storage.set('key', 'value').write();
const value = storage.get('key').value();
storage.set('nested.path', { data: true }).write();
```

## Authentication

BEM supports multiple authentication methods (checked in order):

1. **Bearer Token (JWT)**
   ```
   Authorization: Bearer <firebase-id-token>
   ```

2. **API Key**
   ```javascript
   { apiKey: 'user-private-key' }
   // or
   { authenticationToken: 'user-private-key' }
   ```

3. **Backend Manager Key** (Admin access)
   ```javascript
   { backendManagerKey: 'your-backend-manager-key' }
   ```

4. **Session Cookie**
   ```
   Cookie: __session=<firebase-id-token>
   ```

**Authenticated User Object:**

```javascript
const user = await assistant.authenticate();

{
  authenticated: true,
  auth: { uid: 'abc123', email: 'user@example.com' },
  roles: { admin: false, betaTester: false, developer: false },
  plan: { id: 'basic', status: 'active', ... },
  api: { clientId: '...', privateKey: '...' },
  // ... other user properties
}
```

## CLI Commands

BEM includes a CLI for development and deployment:

```bash
# Install globally or use npx
npm install -g backend-manager
# or
npx backend-manager <command>
```

| Command | Description |
|---------|-------------|
| `bem setup` | Run Firebase project setup and validation |
| `bem serve` | Start local Firebase emulator |
| `bem deploy` | Deploy functions to Firebase |
| `bem test [paths...]` | Run integration tests |
| `bem emulators` | Start Firebase emulators (keep-alive mode) |
| `bem version`, `bem v` | Show BEM version |
| `bem clear` | Clear cache and temp files |
| `bem install`, `bem i` | Install BEM (local or production) |
| `bem clean:npm` | Clean and reinstall npm modules |
| `bem firestore:indexes:get` | Get Firestore indexes |
| `bem cwd` | Show current working directory |

## Environment Variables

Set these in your `functions/.env` file:

| Variable | Description |
|----------|-------------|
| `BACKEND_MANAGER_KEY` | Admin authentication key |

## Response Headers

BEM attaches metadata to responses:

```
bm-properties: {"code":200,"tag":"functionName/executionId","usage":{...},"schema":{...}}
```

## Testing

BEM includes an integration test framework that runs against Firebase emulators.

### Running Tests

```bash
# Option 1: Two terminals (recommended for development)
npx bm emulators  # Terminal 1 - keeps emulators running
npx bm test       # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulators, shuts down after)
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

### Writing Tests

**Suite** - Sequential tests with shared state (stops on first failure):

```javascript
// test/functions/user/sign-up.js
module.exports = {
  description: 'User signup flow with affiliate tracking',
  type: 'suite',
  tests: [
    {
      name: 'verify-referrer-exists',
      async run({ firestore, assert, state, accounts }) {
        state.referrerUid = accounts.referrer.uid;
        const doc = await firestore.get(`users/${state.referrerUid}`);
        assert.ok(doc, 'Referrer should exist');
      },
    },
    {
      name: 'call-user-signup-with-affiliate',
      async run({ http, assert, state }) {
        const response = await http.as('referred').command('user:sign-up', {
          attribution: { affiliate: { code: 'TESTREF' } },
        });
        assert.isSuccess(response);
      },
    },
  ],
};
```

**Group** - Independent tests (continues even if one fails):

```javascript
// test/functions/admin/firestore-write.js
module.exports = {
  description: 'Admin Firestore write operation',
  type: 'group',
  tests: [
    {
      name: 'admin-auth-succeeds',
      auth: 'admin',
      async run({ http, assert }) {
        const response = await http.command('admin:firestore-write', {
          path: '_test/doc',
          document: { test: 'value' },
        });
        assert.isSuccess(response);
      },
    },
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.command('admin:firestore-write', {
          path: '_test/doc',
          document: { test: 'value' },
        });
        assert.isError(response, 401);
      },
    },
  ],
};
```

**Auth levels:** `none`, `user`/`basic`, `admin`, `premium-active`, `premium-expired`

See `CLAUDE.md` for complete test API documentation.

## Final Words

If you are still having difficulty, we would love for you to post a question to [the Backend Manager issues page](https://github.com/itw-creative-works/backend-manager/issues). It is much easier to answer questions that include your code and relevant files! So if you can provide them, we'd be extremely grateful (and more likely to help you find the answer!)

## Projects Using this Library

[Somiibo](https://somiibo.com/): A Social Media Bot with an open-source module library.
[JekyllUp](https://jekyllup.com/): A website devoted to sharing the best Jekyll themes.
[Slapform](https://slapform.com/): A backend processor for your HTML forms on static sites.
[SoundGrail Music App](https://app.soundgrail.com/): A resource for producers, musicians, and DJs.
[Hammock Report](https://hammockreport.com/): An API for exploring and listing backyard products.

Ask us to have your project listed! :)

## License

ISC
