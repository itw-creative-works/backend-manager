# Creating Routes, API Commands, Events, Cron Jobs

Recipes for building consumer-side routes plus BEM-side API commands, event handlers, and cron jobs. See also [docs/schemas.md](schemas.md) for schema definitions, [docs/auth-hooks.md](auth-hooks.md) for auth lifecycle hooks, and [docs/common-operations.md](common-operations.md) for inside-the-handler patterns.

## New API Command

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

## New Route (Consumer Project)

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

## New Event Handler

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

## New Cron Job (Consumer Project)

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
