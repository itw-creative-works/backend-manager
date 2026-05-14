# Sanitization (XSS Prevention)

BEM automatically sanitizes all incoming request data — stripping HTML tags and trimming whitespace from every string field. This happens in the middleware pipeline before route handlers execute, so **routes receive clean data by default**.

## How It Works

1. **Schema fields**: Sanitized per-field during the middleware pipeline. Fields can opt out with `sanitize: false` in the schema.
2. **Non-schema fields** (when `setupSettings: false` or `includeNonSchemaSettings: true`): All strings are sanitized with no opt-out.
3. The middleware uses `Manager.Utilities().sanitize()` under the hood.

## Schema Opt-Out

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

## Route-Level Opt-Out

Disable sanitization entirely for a route (rare — only for routes that handle raw HTML everywhere):

```javascript
// In functions/index.js
Manager.Middleware(req, res).run('my-route', { sanitize: false });
```

## Manual Sanitization (Outside Middleware)

For cron jobs, event handlers, or anywhere outside the request pipeline, use `utilities.sanitize()` directly:

```javascript
// Available in route context
const clean = utilities.sanitize(untrustedData);

// Or via Manager
const clean = Manager.Utilities().sanitize(untrustedData);
```

Accepts any data type — strings, objects, arrays, primitives. Walks objects/arrays recursively, strips HTML from strings, passes everything else through unchanged.

## Route Handler Context

The middleware injects these into every route handler:

```javascript
module.exports = async ({ Manager, assistant, analytics, usage, user, settings, libraries, utilities }) => {
  // settings    — already sanitized by middleware
  // utilities   — Manager.Utilities() instance for manual sanitization
};
```
