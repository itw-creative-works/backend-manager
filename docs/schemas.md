# Schemas

Schemas define and validate the payload your routes accept. They live at `functions/schemas/{name}/{method}.js` — the resolver loads the method-specific file first (`get.js` / `post.js` / …), falling back to `{name}/index.js` (see `src/manager/helpers/settings.js`). The schema name defaults to the route name (`.run('items')` ↔ `functions/schemas/items/`).

## Schema function contract

A schema exports a function that receives a **context object** and returns a **flat schema object**. Plan-based adjustments happen INSIDE the function (there is no tier system):

```javascript
module.exports = ({ assistant, user, data, method, headers, geolocation, client }) => {
  const planId = user?.subscription?.product?.id || 'basic';
  const isPremium = planId !== 'basic';

  const schema = {
    name: {
      types: ['string'],
      default: '',
      required: true,
    },
    limit: {
      types: ['number'],
      default: 10,
      min: 1,
      max: isPremium ? 1000 : 100,   // plan-based limit
    },
  };

  // Premium-only field (not present for basic users)
  if (isPremium) {
    schema.premiumOnlyField = {
      types: ['string'],
      default: 'premium-feature',
    };
  }

  return schema;
};
```

Context fields: `assistant`, `user` (resolved user), `data` (raw request data), `method`, `headers`, `geolocation`, `client`.

## Field Properties

- `types` — array of allowed types: `['string']`, `['number']`, `['boolean']`, `['object']`, `['array']`, `['any']`, or multiple (`['string', 'number']`)
- `default` — default value if not provided; may be a function (`default: () => ...`)
- `value` — force-set value (ignores user input — e.g. auto-generated IDs)
- `required` — `true`/`false` or a function `(assistant, settings, options) => bool`. **NEVER combine with `default`** — see the footgun below
- `min` / `max` — validation bounds (string length, number range, array length); numbers clamp
- `clean` — a RegExp (matched chars removed) or function `(value) => cleaned`
- `sanitize` — per-field opt-out (`false`) for HTML sanitization; only meaningful when the route opts in via `Manager.Middleware(req, res).run('route', { sanitize: true })`. See [sanitization.md](sanitization.md)

### ⚠️ `required` + `default` footgun

BEM checks `required` against the ORIGINAL request value, before defaults apply — so `required: true` on a field with a `default` throws `Required key {field} is missing in settings` before the default is ever used. For fields that must be non-empty but have a derived default (like path-extracted IDs), use `min: 1` instead.

## ID Generation (POST — Create)

IDs are auto-generated in the **schema**, NOT in the route. Use `value` to force-generate via BEM's built-in `randomId()` (14-char nanoid, 62-char alphabet, no `-` or `_`):

```javascript
id: {
  types: ['string'],
  value: () => assistant.Manager.Utilities().randomId(),
},
```

The route just reads `settings.id` — no ID generation logic needed.

## ID Extraction from Path (GET, PUT, DELETE)

For single-item operations, extract the ID from the URL path in the **schema**:

```javascript
// /items/{id} → split('/') = ['', 'items', '{id}'] → index 2
id: {
  types: ['string'],
  default: (assistant.request.path || '').split('/')[2] || '',
  min: 1,     // enforce non-empty (NOT required: true — see footgun above)
  max: 128,
},
```

For GET list endpoints, omit `min` so an empty ID means "list":

```javascript
id: {
  types: ['string'],
  default: (assistant.request.path || '').split('/')[2] || '',
},
limit: { types: ['number'], default: 20, min: 1, max: 100 },
startAfter: { types: ['string'], default: '' },
```

## Dynamic Schemas

Schemas can branch on request data (e.g. different fields per type):

```javascript
module.exports = ({ assistant, data }) => {
  const type = data?.type || '';

  const schema = {
    name: { types: ['string'], default: undefined, required: true },
    type: { types: ['string'], default: undefined, required: true },
    options: {},
  };

  switch (type) {
    case 'url':
      schema.options = { url: { types: ['string'], default: undefined, required: true } };
      break;
    case 'text':
      schema.options = { text: { types: ['string'], default: undefined, required: true } };
      break;
    default:
      schema.options = {};
  }

  return schema;
};
```

## Reference Implementation

The comprehensive test schema exercising every field option (types, function defaults, forced `value`, conditional `required`, min/max clamping, `clean` regex + function, nested objects, plan-based fields): [`src/manager/schemas/test/schema/post.js`](../src/manager/schemas/test/schema/post.js).

## Field Sanitization

Middleware always trims whitespace on string fields. HTML sanitization is **opt-in per route** — `Manager.Middleware(req, res).run('my-route', { sanitize: true })`. When opted in, fields can individually opt back out with `sanitize: false`. See [sanitization.md](sanitization.md).

## See also

- [routes.md](routes.md) — the routes consuming `settings`
- [sanitization.md](sanitization.md) — trim vs HTML-strip behavior
- [test-framework.md](test-framework.md) — schema tests (`test/routes/test/schema.js`)
