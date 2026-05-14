# Common Operations

Inside-the-handler patterns for the most frequent operations. See [docs/routes.md](routes.md) for the route file structure itself.

## Authenticate User

```javascript
const user = await assistant.authenticate();
if (!user.authenticated) {
  return assistant.errorify('Authentication required', { code: 401 });
}
```

## Read/Write Firestore

```javascript
const { admin } = Manager.libraries;

// Read
const doc = await admin.firestore().doc('users/abc123').get();
const data = doc.data();

// Write
await admin.firestore().doc('users/abc123').set({ field: 'value' }, { merge: true });
```

## Handle Errors

```javascript
// Send error response
assistant.errorify('Something went wrong', { code: 500, sentry: true });

// Or throw to reject
return reject(assistant.errorify('Bad request', { code: 400 }));
```

## Send Response

```javascript
// Success
assistant.respond({ success: true, data: result });

// With custom status
assistant.respond({ created: true }, { code: 201 });

// Redirect
assistant.respond('https://example.com', { code: 302 });
```

## Use Hooks (Consumer Project)

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
