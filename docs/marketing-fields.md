# Marketing Custom Fields

BEM syncs user data to marketing providers (SendGrid, Beehiiv) as custom fields. Field definitions live in a single dictionary; OMEGA provisions them in each provider.

## Adding a New Field

1. Add the field to `FIELDS` in `src/manager/libraries/email/constants.js` — the key IS the field name in both providers. Set `source`, `path`, `type`.
2. Add matching entry in OMEGA's `src/lib/bem-fields.js` with `name`, `display`, `type`. If Beehiiv has it built-in (e.g., country, utm_source), set `beehiivBuiltIn: true`.
3. Run OMEGA: `npm start -- --service=sendgrid,beehiiv --brand=X`
4. BEM resolves field IDs at runtime — no provider code changes needed.

## How It Works

- **SendGrid**: `resolveFieldIds()` fetches field definitions from the SendGrid API, builds a name-to-ID cache, and maps values to SendGrid's auto-generated IDs (e.g., `brand_id` maps to `e35_T`).
- **Beehiiv**: BEM uses the key directly as the custom field name — no ID resolution needed.
- **OMEGA**: The `ensure/custom-fields.js` handlers are idempotent — they fetch existing fields and only create what is missing.

## Key Files

| Purpose | File |
|---------|------|
| Field dictionary (BEM SSOT) | `src/manager/libraries/email/constants.js` |
| Field provisioning list (OMEGA SSOT) | `omega-manager/src/lib/bem-fields.js` |
| SendGrid provisioning | `omega-manager/src/services/sendgrid/ensure/custom-fields.js` |
| Beehiiv provisioning | `omega-manager/src/services/beehiiv/ensure/custom-fields.js` |
