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

By default, every string field in a schema is sanitized (HTML tags stripped, whitespace trimmed) during the middleware pipeline. To preserve raw HTML (rich text, email templates), set `sanitize: false` on the field. See [docs/sanitization.md](sanitization.md).
