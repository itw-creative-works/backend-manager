# Sanitization (XSS Prevention)

BEM middleware always **trims** whitespace on incoming string fields (via `utilities.trim()`). HTML sanitization is **opt-in** — it's not run by default because it mangles legitimate input like URL query strings (`&` → `&amp;`) and Markdown.

The expectation is that you sanitize at the **HTML-insertion site** (in the template, in the email body, etc.) — not at the request boundary.

## How It Works

1. **Trimming**: Every string in `settings` is whitespace-trimmed by the middleware (objects + arrays walked recursively). Always on.
2. **HTML sanitization**: Off by default. Opt in per-route with `{ sanitize: true }` on `Manager.Middleware(...).run(...)`.
3. **Schemas** can mark individual fields with `sanitize: false` to skip the HTML strip for that field when route-level sanitize is enabled (used for fields that legitimately need raw HTML — rich-text editors, email templates).

## Route-Level Opt-In

```javascript
// In functions/index.js — enable HTML strip for a specific route
Manager.Middleware(req, res).run('my-route', { sanitize: true });
```

When enabled, every string in `settings` is run through `sanitize-html` (strip all tags) unless the schema marks the field with `sanitize: false`.

## Schema Field Opt-Out (when route-level sanitize is on)

```javascript
// This field will NOT be sanitized — raw HTML is preserved
htmlContent: {
  types: ['string'],
  default: '',
  sanitize: false,
},
// This field IS sanitized when route-level sanitize is enabled
name: {
  types: ['string'],
  default: '',
},
```

## Manual Sanitization (Recommended)

For most use cases — particularly anywhere you're inserting user-supplied content into HTML — call `utilities.sanitize()` directly at the insertion site:

```javascript
// Available in route context
const safeHtml = utilities.sanitize(untrustedData);

// Or via Manager
const safeHtml = Manager.Utilities().sanitize(untrustedData);
```

Accepts any data type — strings, objects, arrays, primitives. Walks objects/arrays recursively, strips HTML from strings, passes everything else through unchanged.

## Why HTML Sanitization Is Not the Middleware Default

Stripping HTML from every incoming string at the request boundary is too aggressive — it corrupts legitimate input:

- URL query strings: `https://example.com/?a=1&b=2` becomes `https://example.com/?a=1&amp;b=2`
- Markdown / code snippets with `<`, `>`, `&` characters get mangled
- API payloads round-tripped through the system get silently rewritten

Stored XSS comes from rendering, not from receiving. Sanitize at the render site (where you know the output context — HTML body, attribute, URL, JSON) instead of at the front door.

## Route Handler Context

```javascript
module.exports = async ({ Manager, assistant, analytics, usage, user, settings, libraries, utilities }) => {
  // settings    — whitespace-trimmed by middleware; HTML preserved unless route opts in via { sanitize: true }
  // utilities   — Manager.Utilities() instance for manual sanitize()/trim()
};
```
