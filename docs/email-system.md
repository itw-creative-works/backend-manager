# Email System

Unified MJML-based email rendering for transactional, marketing, and newsletter emails. All email types go through the same pipeline: **prepare → render (MJML) → deliver (SendGrid)**. No SendGrid dynamic templates (`d-xxx` IDs) — everything is rendered server-side.

## Architecture

### Pipeline Overview

```
Caller (route/transition/cron)
  → prepare.js (shared: brand, sender, signoff, content, categories, unsubscribe URL)
    → templates/index.js (resolve template by name)
      → template.build({ data, theme }) → MJML string
        → mjml-template.js (compile MJML → email-safe HTML, UTM-tag all links)
          → transactional/index.js (recipients, dedup, SendGrid Mail Send)
             OR marketing/index.js (audience, Single Send)
```

### Entry Points

| Context | API | Delivers via |
|---|---|---|
| Transactional (individual) | `Manager.Email(assistant).send(settings)` | SendGrid Mail Send |
| Marketing (campaign) | `Manager.Email(assistant).sendCampaign(settings)` | SendGrid Single Send + Beehiiv |
| Newsletter (generated) | `generators/newsletter.js` → `renderNewsletter()` | Same as marketing |

### Shared Preparation (`prepare.js`)

Both transactional and marketing paths share the same preparation layer:

| Function | Purpose |
|---|---|
| `resolveBrand(Manager)` | Clones brand config, sanitizes images (SVG→PNG via CDN naming) |
| `resolveSender({ sender, from, group }, brand, brandDomain)` | Resolves sender from/display-name/ASM group by category key |
| `renderContent({ content, html }, utmOptions)` | Markdown→HTML via markdown-it, applies UTM link tagging |
| `resolveSignoff(signoff)` | Fills personal signoff defaults (headshot, name, URL) when `type: 'personal'` |
| `buildCategories(type, brandId, extra)` | Builds categories array: `['transactional', brandId, ...extra]` |
| `buildUnsubscribeUrl({ email, groupId, template, websiteUrl })` | HMAC-signed one-click unsubscribe URL |
| `buildTemplateData({ brand, subject, ... })` | Deep-merges system defaults with caller data into the template data tree |
| `render({ brand, template, data, utm })` | Compiles MJML template to email-safe HTML via `renderEmail()` |

### Transactional Pipeline (`transactional/index.js`)

Steps inside `build()`:

1. **Brand + sender** — `prepare.resolveBrand()` + `prepare.resolveSender()`
2. **Recipients** — normalize to `{ email, name }`, UID lookup from Firestore, dedup across to/cc/bcc
3. **Content** — `prepare.renderContent()` (markdown→HTML if needed)
4. **Template data** — `prepare.buildTemplateData()` merges brand/signoff/email/categories with caller data
5. **Render** — `prepare.render()` → MJML template → compiled HTML → UTM-tag all links
6. **Assemble** — SendGrid Mail Send object with `content: [{ type: 'text/html', value: html }]`

After `build()`, `send()` delivers via SendGrid, handles scheduled sends (>71h → queue), and persists an audit trail to `emails/{messageId}`.

### Marketing Pipeline (`marketing/index.js`)

`_sendCampaignSendGrid()` follows the same prepare → render → deliver pattern. Content comes from `data.content.message` (markdown) — same location as transactional callers. Key difference: audience targeting uses brand-scoped dynamic segments (see [marketing-campaigns.md](marketing-campaigns.md)).

### Email Validation Pipeline (`validation.js`)

All marketing contact operations (`add`, `sync`) pass through `validate()` before reaching providers. Checks run in order; the first failure short-circuits.

| # | Check | What it catches | Cost | Default |
|---|---|---|---|---|
| 1 | `format` | Regex: must have `@`, domain, no spaces | Free | Yes |
| 2 | `disposable` | ~7k known disposable domains (vendor list + custom additions) | Free | Yes |
| 3 | `corporate` | Social/corporate domains (instagram.com, facebook.com, etc.) | Free | Yes |
| 4 | `localPart` | Junk local parts (test, noreply, all-numeric, `_test.*`) | Free | Yes |
| 5 | `typo` | Common domain misspellings via prefix match (`gamil.`, `gmai.`, `aol.con`, `gmail.cok`, etc.) | Free | Yes |
| 6 | `dns` | No MX record, null MX (RFC 7505), loopback MX, domain not found | Free | Opt-in |
| 7 | `mailbox` | SMTP mailbox verification via NeverBounce or ZeroBounce | Paid | Opt-in |

- **`DEFAULT_CHECKS`** = checks 1–5 (all free, run on every `mailer.add()`/`mailer.sync()` call)
- **`ALL_CHECKS`** = checks 1–7 (used at signup to include paid mailbox verification)
- The `dns` check is opt-in (not in DEFAULT_CHECKS) because it's async/slower — include it for bulk validation
- The `typo` check uses prefix matching (`"gamil."` catches `gamil.com`, `gamil.con`, `gamil.co`) — see `data/typo-domains.js`
- Custom disposable domains go in `data/custom-disposable-domains.json` (not the vendor list)
- Run `node src/manager/libraries/email/validation.test.js` to verify all checks

## Data Contract

The template receives one `data` object with a clear separation of concerns:

- **`data.content`** — template-specific payload. **Callers provide this.** What goes inside depends on the template.
- **`data.signoff`** — shared across templates. **Callers provide this** (defaults to team if omitted).
- **`data.brand`** / **`data.email`** / **`data.personalization`** — **system-injected by `prepare.js`**. Callers never touch these.

Every caller — transactional, marketing, transition handler — passes data the same way:

```js
await email.send({
  template: 'card',
  subject: 'Welcome!',
  to: 'user@example.com',
  sender: 'hello',
  categories: ['account/welcome'],
  data: {
    content: { title: 'Welcome!', message: '# Hello!\n\nMarkdown here.' },
    signoff: { type: 'personal' },
  },
});
```

### Per-template `data.content` shapes

| Template | `data.content` fields |
|---|---|
| **card** | `{ title, message, button: { text, url } }` |
| **plain** | `{ greeting, message, link: { url, text }, signoff }` |
| **order** | `{ event, id, type, unified, _computed, processor }` |
| **feedback** | (none — self-contained) |

Marketing campaigns add `discountCode` to `data.content`:
```js
data: {
  content: {
    title: 'Summer Sale!',
    message: 'Markdown with **{discount.code}**...',
    button: { text: 'Upgrade Now →', url: '{brand.url}/pricing' },
    discountCode: 'SUMMER15',
  },
}
```

Template variables (`{brand.name}`, `{discount.code}`, `{holiday.name}`, etc.) are resolved across the entire settings object before rendering.

## Template System

### Template Registry (`templates/index.js`)

Two registries, two resolve functions:

```js
resolveEmailTemplate('card')         // → card | plain | order | feedback
resolveNewsletterTemplate('clean')   // → clean | editorial | field-report
```

No aliases. Callers use direct template names. Unknown email templates fall back to `card` with a console warning.

### Template Builder Signature

Every email template exports `{ build, meta }`:

```js
function build({ data, theme, templateName }) {
  return '<mjml>...</mjml>';
}
const meta = { name: 'card', description: '...' };
module.exports = { build, meta };
```

### Composable Base Blocks (`base.js`)

All templates compose from shared building blocks. `skeleton()` is required; everything else is opt-in.

| Block | Purpose | Used by |
|---|---|---|
| `skeleton(opts, content)` | Required wrapper. `<mjml>` + `<mj-head>` (title, preview, styles) + `<mj-body>` + hidden ASM tags + hidden category tags | All templates |
| `logo(brand, theme)` | Centered brandmark image (or fallback text) | card, order, feedback |
| `cardWrapper(content)` | White card with border + 16px rounded corners | card, order, feedback |
| `signoff(data, theme)` | Team ("The Brand Team") or personal (headshot + name + link) | card, order |
| `button(btn)` | Dark CTA button | card, order |
| `footer(brand, email)` | ITW wordmark, footer text, links (account/terms/privacy/unsub), copyright, address | card, order, feedback |

### Hidden Tags (inside `skeleton()`)

Every email includes hidden elements that SendGrid and email clients process but users don't see:

- **ASM tags**: `<%asm_group_unsubscribe_raw_url%>` + `<%asm_preferences_raw_url%>` — suppress SendGrid's auto-inserted unsubscribe text
- **Category tags**: `category=transactional`, `category=order/confirmation`, etc. — used for email sorting/filtering

### Email Templates

#### `card` (default)

The workhorse. White card on gray background with logo, title, markdown body, optional CTA button, signoff, and full footer. Used for: welcome emails, account notifications, data requests, general transactional, marketing campaigns.

#### `plain`

Looks like a regular email from a person. No logo, no card, no branding. Full-width (`<mj-body width="100%">`). Just message + signoff + minimal gray footer with unsubscribe link. Used for: personal outreach, plain notifications.

#### `order`

Handles ALL 9 order event types in one template. Event from `data.content.event`. Componentized into sections:

| Section | Purpose |
|---|---|
| `_header()` | Emoji + title + subtitle per event type |
| `_summary()` | Product/price/discount/total table (only for `SUMMARY_EVENTS`) |
| `_details()` | Date, processor, frequency, account email |
| `_explanation()` | Conditional paragraphs: trial notice, promo code, cancellation reason, etc. |
| `_ctaButton()` | CTA pointing to dashboard/billing/pricing depending on event |
| `_helpText()` | "Questions? Contact support" |

**Event types:**

| Event | Fired by | Emoji |
|---|---|---|
| `confirmation` | new-subscription, purchase-completed | :tada: |
| `payment-failed` | payment-failed transition | :warning: |
| `payment-recovered` | payment-recovered transition | :white_check_mark: |
| `cancellation-requested` | cancellation-requested transition | :wave: |
| `cancelled` | subscription-cancelled transition | :x: |
| `plan-changed` | plan-changed transition | :arrows_counterclockwise: |
| `refunded` | payment-refunded transition | :moneybag: |
| `trial-ending` | (future) trial-ending cron | :hourglass: |
| `abandoned-cart` | abandoned-carts cron | :shopping_cart: |

#### `feedback`

Rating faces (dislike/neutral/like/love) with gift card incentive. Four clickable face images linking to a feedback URL with a `rating` query param. Invisible placeholder labels on empty cells for vertical alignment. Used by the signup post-onboarding feedback email.

### Newsletter Templates

Newsletter templates are separate from email templates — different input shape, different registry. See [marketing-campaigns.md](marketing-campaigns.md) for the full newsletter system.

| Template | Style |
|---|---|
| `clean` | Simple, minimal |
| `editorial` | Full-width hero sections, editorial tone |
| `field-report` | Structured dispatch format |

## UTM Auto-Tagging

`utm.js` → `tagLinks()` auto-tags **all HTTP/HTTPS links** in email HTML — not just brand-domain links. Applied at two levels:

1. **Content rendering** — `prepare.renderContent()` tags links in the markdown→HTML body
2. **MJML compilation** — `renderEmail()` tags links in the compiled template HTML (CTA buttons, footer links, signoff links, etc.)

Default UTM params (auto-derived, no manual setup needed):

| Param | Source | Example |
|---|---|---|
| `utm_source` | Brand ID | `somiibo` |
| `utm_medium` | Always `email` | `email` |
| `utm_campaign` | First caller category (transactional) or campaign name (marketing) | `account_welcome`, `summer_sale_free_users` |
| `utm_content` | `transactional` or `marketing` | `transactional` |

Existing UTM params on a URL are never overwritten. Callers can pass `utm: { utm_term: '...' }` for additional params. Values are sanitized to lowercase alphanumeric + underscores.

## Transition Handler Email Convention

All payment transition handlers pass `template: 'order'` + `data.content` to the `send-email` utility:

```js
// In transitions/subscription/new-subscription.js:
sendOrderEmail({
  template: 'order',
  subject: 'Your order #...',
  categories: ['order/confirmation'],
  data: {
    content: { event: 'confirmation', ...order, _computed: { ... } },
  },
});
```

The order template reads `data.content` for all rendering decisions. No per-event template files — the single `order.js` handles everything.

### Personalization

Recipient display name in Gmail comes from the `to` field: `{ email: 'user@example.com', name: 'Taylor Trial' }`. In the email body, templates use `data.personalization.name` for greetings like "Hey Taylor".

Names are resolved during recipient normalization in the transactional pipeline — the user's `personal.name.first` from their Firestore doc is used when available.

## Sender Categories

Defined in `constants.js` → `SENDERS`. Each category auto-resolves a from address, display name, and ASM unsubscribe group:

| Category | From | Display Name | ASM Group |
|---|---|---|---|
| `orders` | `orders@{domain}` | Orders at {Brand} | orders (16223) |
| `hello` | `hello@{domain}` | {Brand} | hello (35092) |
| `account` | `account@{domain}` | {Brand} Account | account (25927) |
| `marketing` | `marketing@{domain}` | {Brand} | marketing (25928) |
| `security` | `security@{domain}` | {Brand} Security | security (35093) |
| `newsletter` | `newsletter@{domain}` | {Brand} Newsletter | newsletter (28096) |
| `internal` | `alerts@{domain}` | {Brand} Alerts | internal (35094) |

## Testing

All email tests live under `test/email/`, mirroring the source at `src/manager/libraries/email/`:

| Test file | What it tests | Extended? |
|---|---|---|
| `templates.js` | MJML rendering for all 4 email templates (11 tests) | No |
| `transactional.js` | Transactional email building (assertions on output shape) | No |
| `validation.js` | Email format/disposable/corporate/local-part/typo/dns checks (52 tests) | No |
| `transactional-send.js` | Single transactional email send via SendGrid | Yes |
| `campaign-send.js` | Marketing campaign send with title + CTA + discount code | Yes |
| `feedback-and-plain-send.js` | Feedback + plain template visual test sends | Yes |
| `newsletter-templates.js` | Newsletter MJML rendering (16 tests) | No |
| `newsletter-generate.js` | Full AI newsletter generation pipeline (5min timeout) | Yes |
| `marketing-lifecycle.js` | Contact lifecycle (add/sync/remove) | Yes |
| `consent-lifecycle.js` | Consent webhook round-trip | Yes |

Extended tests (`TEST_EXTENDED_MODE`) send real emails to `_test-*@{domain}` addresses. See [test-framework.md](test-framework.md) for the full test framework reference.

### Test recipient convention

All extended email tests send to `_test-<purpose>@{domain}` addresses (e.g. `_test-email-send@somiibo.com`). This keeps test emails separate from real user traffic and makes filtering easy.

## Key Files

| Purpose | File |
|---|---|
| Shared preparation | `src/manager/libraries/email/prepare.js` |
| Transactional pipeline | `src/manager/libraries/email/transactional/index.js` |
| Marketing pipeline | `src/manager/libraries/email/marketing/index.js` |
| MJML compiler (both email + newsletter) | `src/manager/libraries/email/generators/lib/mjml-template.js` |
| Template registry | `src/manager/libraries/email/generators/lib/templates/index.js` |
| Base blocks | `src/manager/libraries/email/generators/lib/templates/base.js` |
| Card template | `src/manager/libraries/email/generators/lib/templates/card.js` |
| Plain template | `src/manager/libraries/email/generators/lib/templates/plain.js` |
| Order template (9 events) | `src/manager/libraries/email/generators/lib/templates/order.js` |
| Feedback template | `src/manager/libraries/email/generators/lib/templates/feedback.js` |
| UTM link tagging | `src/manager/libraries/email/utm.js` |
| Constants (senders, groups, fields, segments) | `src/manager/libraries/email/constants.js` |
| Email validation | `src/manager/libraries/email/validation.js` |
| Typo domain prefixes | `src/manager/libraries/email/data/typo-domains.js` |
| Custom disposable domains | `src/manager/libraries/email/data/custom-disposable-domains.json` |
| NeverBounce provider | `src/manager/libraries/email/validation-provider-neverbounce.js` |
| ZeroBounce provider | `src/manager/libraries/email/validation-provider-zerobounce.js` |
| Validation test | `src/manager/libraries/email/validation.test.js` |
| Seed campaigns | `src/cli/commands/setup-tests/helpers/seed-campaigns.js` |
| Transition email dispatcher | `src/manager/events/firestore/payments-webhooks/transitions/send-email.js` |
