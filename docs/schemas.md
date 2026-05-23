# Schemas

Schemas define and validate the payload your routes accept. Schema names should match the route name (e.g. route `myEndpoint` ↔ schema `myEndpoint`).

## New Schema (Consumer Project)

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

## Field Sanitization

Middleware always trims whitespace on string fields. HTML sanitization is **opt-in per route** — `Manager.Middleware(req, res).run('my-route', { sanitize: true })`. When opted in, fields can individually opt back out with `sanitize: false`. See [docs/sanitization.md](sanitization.md).
