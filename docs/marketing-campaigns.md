# Marketing Campaign System

## Campaign CRUD Routes (admin-only)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/marketing/campaign` | Create campaign (immediate or scheduled) |
| GET | `/marketing/campaign` | List/filter campaigns by date range, status, type |
| PUT | `/marketing/campaign` | Update pending campaigns (reschedule, edit) |
| DELETE | `/marketing/campaign` | Delete pending campaigns |

## Firestore Collection: `marketing-campaigns/{id}`

```javascript
{
  settings: { name, subject, preheader, content, template, sender, segments, excludeSegments, ... },
  sendAt: 1743465600,        // Unix timestamp (any format accepted, normalized on create)
  status: 'pending',         // pending | sent | failed
  type: 'email',             // email | push
  recurrence: { pattern, day, hour, minute?, nth? },  // Optional — makes it recurring
  generator: 'newsletter',   // Optional — runs content generator before sending
  recurringId: '_recurring-sale',      // Present on history docs (links to parent template)
  generatedFrom: '_recurring-newsletter', // Present on generated docs
  results: { campaigns: {...}, newsletter: {...} },
  metadata: { created: {...}, updated: {...} },
}
```

## Campaign Types

- **Email**: dispatches to SendGrid (Single Send) + Beehiiv (Post) via `mailer.sendCampaign()`
- **Push**: dispatches to FCM via `notification.send()` (shared library)
- Content is **markdown** — converted to HTML at send time. Template variables resolved before conversion.

## Recurring Campaigns

Campaigns with a `recurrence` field repeat automatically:
- Cron fires → creates a **history doc** (same collection, `recurringId` set) → advances `sendAt` to next occurrence
- Status stays `pending` on the recurring template, history docs are `sent`/`failed`
- `_` prefix on IDs groups them at top of Firestore console

Recurrence patterns: `daily`, `weekly`, `monthly`, `monthly-weekday`, `quarterly`, `yearly`

The `monthly-weekday` pattern targets the Nth weekday of each month (e.g., 2nd Wednesday). Requires `nth` (1-4) and `day` (0=Sun–6=Sat) in the recurrence object. All other patterns use simple interval addition from the current `sendAt`.

All scheduling helpers live in `constants.js` (SSOT): `nextWeekday()`, `nextNthWeekday()`, `nextMonthDay()`, `getNextOccurrence()`. The cron job imports from there — no duplicated logic.

## Generator Campaigns

Campaigns with a `generator` field (e.g. `generator: 'newsletter'`) are handled by the frequent cron inline — generate content and send in one shot when `sendAt` is due:
1. Frequent cron finds the generator campaign past its `sendAt`
2. Runs the generator module (e.g., `generators/newsletter.js`)
3. Sends the generated content immediately
4. Stores a history record with generated content + send results
5. Advances the recurring template's `sendAt` to the next occurrence

In production, Beehiiv posts are published (`status: 'confirmed'`). In testing, they're forced to draft (`status: 'draft'`). If Beehiiv upload fails, a fallback alert email is sent to `alerts@{brandDomain}` with all asset links for manual upload.

## Email Rendering

All campaign emails are rendered server-side via the unified MJML template system — no SendGrid dynamic templates (`d-xxx` IDs). The marketing pipeline calls `prepare.render()` to compile campaign content through the same MJML pipeline used by transactional emails.

Campaign content is **markdown** — converted to HTML via `renderContent()`, then passed to the resolved email template (default: `card`). The rendered HTML goes into SendGrid's `html_content` field on the Single Send.

See [docs/email-system.md](email-system.md) for the full template system reference (composable base blocks, template registry, all 4 email templates).

## Template Variables

Resolved at send time via `powertools.template()`. Single braces `{var}` for campaign-level.

| Variable | Example Output |
|----------|---------------|
| `{brand.name}` | Somiibo |
| `{brand.id}` | somiibo |
| `{brand.url}` | https://somiibo.com |
| `{season.name}` | Winter, Spring, Summer, Fall |
| `{holiday.name}` | Black Friday, Christmas, Valentine's Day, etc. |
| `{date.month}` | November |
| `{date.year}` | 2026 |
| `{date.full}` | March 17, 2026 |

## UTM Auto-Tagging

`libraries/email/utm.js` scans HTML for `<a href>` matching the brand's domain and appends UTM params. Applied to both marketing campaigns and transactional emails.

Defaults: `utm_source=brand.id`, `utm_medium=email`, `utm_campaign=name`, `utm_content=type`. Override via `settings.utm` object.

## Segments SSOT

`SEGMENTS` dictionary in `constants.js` — 22 segment definitions. OMEGA creates them in SendGrid, BEM resolves keys to provider IDs at runtime via `resolveSegmentIds()` (cached).

| Category | Segments |
|----------|----------|
| Subscription (9) | `subscription_free`, `subscription_paid`, `subscription_trialing`, `subscription_cancelling`, `subscription_suspended`, `subscription_cancelled`, `subscription_churned`, `subscription_ever_paid`, `subscription_never_paid` |
| Lifecycle (5) | `lifecycle_7d`, `lifecycle_30d`, `lifecycle_90d`, `lifecycle_6m`, `lifecycle_1y` |
| Engagement (5) | `engagement_active_30d`, `engagement_active_90d`, `engagement_inactive_90d`, `engagement_inactive_5m`, `engagement_inactive_6m` |

Campaigns reference segments by SSOT key: `segments: ['subscription_free']`. Auto-translated to provider IDs.

## Brand-Scoped Dynamic Segments (SendGrid)

### The problem

All brands share one SendGrid account. SendGrid segments are account-wide — `subscription_cancelled` contains cancelled users from ALL brands. `send_to.segment_ids` is a UNION (OR), so you can't intersect a segment with a brand's list. Custom fields like `brand_id` are global per contact (last brand to sync wins), so multi-brand contacts have unreliable `brand_id` values.

### The workaround (current)

At **send time**, the marketing pipeline creates a temporary SendGrid segment that ANDs the original segment's query with `"brand_id" = '<brand>'`. This scopes the audience to the current brand.

**Flow:**
1. Resolve segment names → SendGrid IDs (cached `resolveSegmentIds()`)
2. Fetch each segment's `query_dsl` via `GET /marketing/segments/2.0/{id}`
3. Extract WHERE clauses, combine with `AND "brand_id" = '<brand>'`
4. `POST /marketing/segments/2.0` → creates temp segment (~3s)
5. Use temp segment ID in `send_to.segment_ids`
6. Schedule the Single Send — SendGrid evaluates the query at dispatch time
7. Delete the temp segment after scheduling (query already captured)

Same strategy for exclude segments — a separate temp segment is created and passed in `send_to.exclude_segment_ids`.

**Test mode** skips the brand filter entirely. `test: true` overrides targeting to just `test_admin` with no brand_id condition, no lists, no excludes — so the admin email receives tests regardless of which brand last synced their `brand_id`.

### Timing

- Temp segment creation: ~3s (API call)
- Segment materialization: ~10-15s (contacts_count populates)
- SendGrid evaluates the query at send dispatch, NOT at segment creation — so materialization delay doesn't matter
- Total overhead per campaign send: ~3-7s (create + cleanup)

### Known limitation: `brand_id` is last-write-wins

`brand_id` is a global custom field on the contact. When multiple brands sync the same email address, the last sync overwrites `brand_id`. For 99.9% of contacts (single-brand users), this is correct. Multi-brand contacts (e.g. admin emails) may have the wrong `brand_id`.

### Ideal solution: SendGrid subusers

Per-brand subusers provide full contact/segment/field isolation under one billing account. Requires SendGrid Pro plan ($90/month+). Each subuser gets its own API key, contacts, segments, and custom fields. OMEGA would create a subuser per brand during onboarding. This eliminates all the workarounds above.

### Key files

| Purpose | File |
|---------|------|
| Dynamic segment creation | `sendgrid.js` → `createBrandScopedSegment()` |
| Segment query fetch | `sendgrid.js` → `getSegmentQuery()` |
| Send pipeline integration | `marketing/index.js` → `_sendCampaignSendGrid()` |
| Segment SSOT (conditions) | `constants.js` → `SEGMENTS` |
| OMEGA segment setup | `omega-manager/src/services/sendgrid/ensure/segments.js` |

## Contact Pruning

`cron/daily/marketing-prune.js` — runs 1st of each month. Two stages:
1. **Re-engagement**: send email to `engagement_inactive_5m` (excluding `engagement_inactive_6m`)
2. **Prune**: export `engagement_inactive_6m` contacts, bulk delete from SendGrid + Beehiiv. Never prunes paying customers.

## Newsletter Generator

`generators/newsletter.js` orchestrates a multi-step pipeline that produces a fully rendered, email-safe newsletter. Output is HTML (not markdown) — the marketing library detects `settings.contentHtml` and uses it directly, skipping the markdown pipeline.

Pipeline:
1. Fetch sources: `GET {parentUrl}/newsletter/sources?category=X&claimFor=brandId` (atomic claim)
2. **structure.js** — Generic dispatcher. Resolves the active template, merges `BASE_SCHEMA` (universal fields: subject, preheader, signoff, citations) with the template's own `schema` fragment, calls the template's `buildPrompt({brand, newsletterConfig, sources})` to get the AI brief, runs the AI call, and normalizes the result via the template's optional `normalize()`. Default provider: `openai` (override per-run only via `NEWSLETTER_PROVIDER_STRUCTURE` env).
3. **image-illustrator.js** (default) — One flat-vector PNG per section in parallel (`Promise.all`), generated directly via `Manager.AI(assistant).image()` → `gpt-image-2`. Iterates `structure.sections` — templates whose content shape isn't section-based (e.g. field-report uses `dispatches`) populate `sections` in their `normalize()` step so this loop keeps working unchanged. The prompt enforces a clean flat 2D vector style (Stripe / Linear / undraw.co aesthetic) built from the brand palette (`content.theme.{primary,secondary,accent}Color`), on a white background, no text. **Legacy method:** set `marketing.newsletter.content.method.image = 'svg'` to use the older `svg-illustrator.js` (AI authors an `<svg>`, rasterized via `@resvg/resvg-js`). Both methods return the same `{ png: Buffer, fallback, meta }` contract.
4. **mjml-template.js** — Resolves the template by name from `templates/index.js`, calls `template.build({structure, imagePaths, theme, ...})` for the MJML, compiles to email-safe HTML via the `mjml` package. Brand-domain links get UTM-tagged via the existing `tagLinks()` utility.
5. Mark used: `PUT {parentUrl}/newsletter/sources` per source

> **Step 3 runs concurrently with the linked-article build** (see below) when `article.enabled` is on — both are slow AI calls, so they share one `Promise.all`. The article URL is stamped onto the lead section before steps 4/5 render.

## Newsletter-driven blog article (`article.enabled`)

When `marketing.newsletter.content.article.enabled: true`, the newsletter generator expands its **lead section** (`structure.sections[0]`) into a full blog article and links to it from the newsletter.

Flow (runs in parallel with SVG generation, between structure and render):
1. `buildLinkedArticle()` builds a brief from the lead section's title + body, folded with the shared `tone` + `instructions`.
2. **Ghostii** (`libraries/content/ghostii.js` → `writeArticle()`) expands it into a full article + hero image.
3. `publishArticle()` POSTs to the `admin/post` route (commits markdown + images to the website repo). Public URL = `{brand.url}/blog/{slug}`.
4. The URL is injected as `structure.sections[0].cta = { label: 'Read the full article', url }`. The MJML `sectionCard` and the markdown renderer both render `section.cta` automatically.

**Failure is isolated** — if the article build throws, it resolves to `null`, no CTA is injected, and the newsletter ships normally. The newsletter never depends on the article succeeding.

The published URL is surfaced on the return as `assets.articleUrl` and `meta.article`. Config block: `marketing.newsletter.content.article = { enabled, author }` (`enabled` default `false`; `author` is the post author slug). Standalone article publishing (independent of the newsletter) lives in the daily `blog-auto-publisher.js` cron, which uses the same `libraries/content/ghostii.js` engine — see [docs/admin-post-route.md](admin-post-route.md). Standalone blog publishing is **disabled by default** (`blog.enabled: false`).

## Template-owned schemas

Each template under `lib/templates/` owns its own content shape. Templates export:

```js
module.exports = {
  build({ structure, imagePaths, theme, brandName, brandUrl, brandAddress, sponsorships, now }),  // → MJML
  meta:     { name, description, requires, optional, supports },
  schema:   { required, properties },  // JSON schema FRAGMENT — merged into BASE_SCHEMA
  normalize(structure, { brand, newsletterConfig }),  // optional post-AI normalization
  buildPrompt({ brand, newsletterConfig, sources }),  // optional — defaults to classic prompt
};
```

`BASE_SCHEMA` (in `structure.js`) declares the universals every newsletter must have: `subject`, `preheader`, `signoff`, `citations`. Templates merge their own fields on top via `schema.properties` + `schema.required`.

**Adding a new template:**
1. Create `lib/templates/<name>.js` with `build`, `meta`, `schema`, and `normalize`. Add `buildPrompt` if the content shape requires a custom AI brief.
2. Register it in `lib/templates/index.js`.
3. **Add a matching fixture** at `test/marketing/fixtures/<name>.json` with the same content shape. This is REQUIRED — the iteration test loads it by default when the active brand's template is your new one. Without it, the default test run fails with "fixture not found".
4. Add the template name to the `TEMPLATES` array in `test/marketing/newsletter-templates.js` so the fixture suite renders it. Add per-template assertions if the new template renders unique identity markers (e.g. field-report's `LEAD DISPATCH` kicker).
5. Audit graceful omission — every template's `build()` must handle missing optional fields (return `''` for omitted blocks rather than throwing). Existing templates (clean, editorial, field-report) all do this.

Existing classic-shape templates (`clean`, `editorial`) share their schema via `lib/templates/classic-schema.js`. New templates with the same `{intro, sections: [{title, body, cta, image_prompt}]}` shape should reuse `CLASSIC_SCHEMA` + `normalizeClassic` rather than duplicating.

## Iteration test default behavior

`test/marketing/newsletter-generate.js` runs in **fixture mode by default** — it loads `test/marketing/fixtures/<active-template>.json` and renders straight through MJML. ~25-50ms, no AI, $0. This is what runs in CI and what you use for layout iteration.

Set `TEST_EXTENDED_MODE=1` to switch to the full AI pipeline against real sources from the parent server. That mode requires `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `BACKEND_MANAGER_KEY`, and a parent URL.

Per-brand customization lives under `marketing.newsletter.content` — nested under `newsletter` because the newsletter role owns the content pipeline. The whole pipeline is gated by `marketing.newsletter.enabled`. Each role specifies its platform via a `platform` key (e.g. `platform: 'beehiiv'`):

```js
marketing.newsletter = {
  enabled: true,
  platform: 'beehiiv',
  publicationId: 'pub_xxxxx',
  content: {
    categories: ['social-media', 'marketing'],
    instructions: '...',           // free-form text for the AI
    tone: 'professional',          // 'casual' | 'actionable' | 'witty' | etc.
    template: 'field-report',      // clean | editorial | field-report
    theme: { primaryColor, secondaryColor, accentColor, font },
    sponsorships: [ ... ],
  },
}
```

AI provider defaults live in code (openai for structure, anthropic for SVG — each chosen for what each model does best). Override per-run only via env: `NEWSLETTER_PROVIDER_STRUCTURE` / `NEWSLETTER_PROVIDER_SVG`. No per-brand override — every brand uses the same defaults.

## Asset hosting (production cron flow)

The frequent cron uploads per-section PNGs + the rendered `newsletter.html` + `newsletter.md` + `summary.md` to the public `itw-creative-works/newsletter-assets` repo as two atomic Git Trees commits per issue (PNGs first so URLs exist for embedding, then HTML/MD/summary in a second commit). Folder layout:

```
{brandId}/{campaignId}/
  section-N.png       — per-section illustration (embedded in HTML)
  newsletter.html     — final rendered email-safe HTML
  newsletter.md       — programmatic markdown view (per-section ## blocks, ready for Beehiiv paste)
  summary.md          — short editorial recap (2-3 sentences)
```

`newsletter.md` is built programmatically from the same `structure` JSON the HTML is rendered from (no AI cost) by `lib/markdown-renderer.js`. Each section/dispatch becomes a standalone `## heading` block — drop it into the Beehiiv editor one block at a time and insert ad blocks between dispatches.

The `campaignId` is the same Firestore doc ID the cron uses for the generated `marketing-campaigns/{newId}` doc, reserved up front so the GitHub URLs and the Firestore doc always match.

Asset URLs are stamped onto the generated campaign doc:

```js
marketing-campaigns/{newId}: {
  settings:    { subject, preheader, contentHtml, ... },
  assets: {
    campaignId,           // same as the doc id
    folderUrl,            // https://github.com/itw-creative-works/newsletter-assets/tree/main/{brandId}/{campaignId}
    htmlUrl,              // https://raw.githubusercontent.com/.../newsletter.html  — paste this into Beehiiv as one block
    markdownUrl,          // https://raw.githubusercontent.com/.../newsletter.md    — per-section blocks (ads between)
    summaryUrl,           // https://raw.githubusercontent.com/.../summary.md       — share-snippet recap
    imageUrls: [...],     // raw.githubusercontent.com URLs already embedded in contentHtml
    beehiivPostId,        // ID of the draft post created on Beehiiv (null if disabled/failed)
    tags: [...]           // AI-generated content tags (also passed to Beehiiv `content_tags`)
  },
  meta:        { tokens, cost, durations, source scores },
  ...
}
```

**`structure` schema (universals)** — every newsletter the generator produces satisfies this regardless of template:

| Field | Purpose |
|---|---|
| `subject` | Email subject (≤80 chars) |
| `preheader` | Inbox preview text (≤120 chars) |
| `summary` | 2-3 sentence editorial recap (≤600 chars) — written to `summary.md` and used as share snippet. Distinct from preheader (which is an inbox hook). |
| `tags` | 0-5 topical tags (lowercase kebab-case) — passed to Beehiiv `content_tags` |
| `signoff` | Two-line closing |
| `citations` | 0-10 `{note, source}` pairs rendered as footnotes |

Templates add their own fields on top (e.g. classic adds `intro` + `sections`; field-report adds `tldr` + `dateline` + `dispatches`).

**No AI-authored CTAs in generated content.** The schema intentionally does NOT include section-level CTAs / outbound links. The AI cannot author URLs reliably — it has no browse access to your site and no real source URLs to reference, so any URL it produces is invented. Newsletters are self-contained reads; outbound links come from sponsorship blocks rendered by the template shell (driven by `marketing.newsletter.content.sponsorships[]`), not from generated section bodies. The **one exception** is the linked-article CTA: when `article.enabled` is on, `section.cta = { label, url }` is injected onto the lead section by code *after* the article is published (a real, verified URL) — never authored by the AI. Both `sectionCard` (MJML) and the markdown renderer render `section.cta` when present.

**Beehiiv failure → fallback alert email.** When Beehiiv draft creation fails (e.g. `SEND_API_NOT_ENTERPRISE_PLAN` on the free plan), the generator sends an internal alert email via `sender: 'internal'` (resolves to `alerts@{brandDomain}`) to `brand.contact.email` with:
- The failure reason
- Subject, preheader, tags
- Direct links to the rendered HTML, per-section markdown, summary, and the full GitHub folder

This means the newsletter is never "stuck" — even with Beehiiv disabled or failing, you get an actionable email pointing to ready-to-paste assets. The alert is best-effort; failure to send is logged but does not block the Firestore campaign-doc write.

Requires `GH_TOKEN` env var (org-scoped, write access to `newsletter-assets`). Without it, the cron's HTML/image upload calls throw and the run aborts.

## Iteration test asset story

`NEWSLETTER_GITHUB_UPLOAD=1` in the iteration test enables the same upload flow against the same repo. Local-only by default for fast layout iteration (writes to `.temp/newsletter/run-<stamp>/newsletter.html`).

| Module | Purpose |
|---|---|
| `lib/structure.js` | Generic AI dispatcher — merges template schema with BASE_SCHEMA, calls template.buildPrompt, normalizes |
| `lib/svg-illustrator.js` | Per-section SVG → PNG (rasterized via `@resvg/resvg-js`) |
| `lib/mjml-template.js` | Template dispatcher → MJML → email-safe HTML, UTM-tagged |
| `lib/templates/index.js` | Template registry (`clean`, `editorial`, `field-report`) |
| `lib/templates/classic-schema.js` | Shared content schema for `clean` + `editorial` |
| `lib/templates/newsletter-shared.js` | Newsletter-specific `shell()` + primitives (sponsorship, citations, footer, address) |
| `lib/templates/shared-campaign.js` | Shared utilities for all templates (`escape()`, `resolveTheme()`, `formatAddress()`) |
| `lib/templates/editorial/helpers.js` | Editorial-only helpers (pullquote, issue number, eyebrow) |
| `lib/templates/field-report/helpers.js` | Field-report-only helpers (kicker, dispatch dateline, terminal block, terminator) |
| `newsletter.js` | Orchestrator — calls lib modules, fetches sources, claims sources |
| `test/marketing/fixtures/{name}.json` | Hand-crafted structure per template (loaded by iteration test in fixture mode) |

## Seed Campaigns

Created by `npx mgr setup` (idempotent, enforced fields checked every run):

| ID | Type | Description |
|----|------|-------------|
| `_recurring-sale-free` | email (campaigns) | Sale targeting free users — 2nd Wednesday of month, 10:30 AM PT (17:30 UTC) |
| `_recurring-sale-churned-trial` | email (campaigns) | Sale targeting churned trial users — 2nd Wednesday, 10:30 AM PT |
| `_recurring-sale-churned-paid` | email (campaigns) | Sale targeting churned paid users — 2nd Wednesday, 10:30 AM PT |
| `_recurring-sale-cancelled` | email (campaigns) | Sale targeting cancelled users — 2nd Wednesday, 10:30 AM PT |
| `_recurring-newsletter` | email (newsletter) | AI-generated newsletter — every Wednesday, 10:30 AM PT (17:30 UTC) |

## Marketing Config

```javascript
marketing: {
  campaigns: { enabled: true, platform: 'sendgrid' },
  newsletter: {
    enabled: false,
    platform: 'beehiiv',
    publicationId: 'pub_xxxxx',
    content: {
      categories: ['social-media', 'marketing'],
      instructions: '',                     // free-form AI instructions
      tone: 'professional',
      template: 'clean',                    // clean | editorial | field-report
      article: {                            // expand the lead section into a linked blog post (Ghostii → admin/post)
        enabled: false,
        author: 'alex-raeburn',             // author slug for the linked article
      },
      theme: { primaryColor, secondaryColor, accentColor, font },
      sponsorships: [ ... ],
    },
  },
  prune: { enabled: true },
}
```

## Key Marketing Files

| Purpose | File |
|---------|------|
| Marketing library | `src/manager/libraries/email/marketing/index.js` |
| Shared preparation (brand, sender, render) | `src/manager/libraries/email/prepare.js` |
| Email template registry | `src/manager/libraries/email/generators/lib/templates/index.js` |
| Composable base blocks (skeleton, logo, card, etc.) | `src/manager/libraries/email/generators/lib/templates/base.js` |
| Field + segment SSOT | `src/manager/libraries/email/constants.js` |
| UTM tagging | `src/manager/libraries/email/utm.js` |
| Newsletter generator | `src/manager/libraries/email/generators/newsletter.js` |
| Newsletter copy (AI) | `src/manager/libraries/email/generators/lib/structure.js` |
| Newsletter SVG (AI) | `src/manager/libraries/email/generators/lib/svg-illustrator.js` |
| Newsletter MJML → HTML | `src/manager/libraries/email/generators/lib/mjml-template.js` |
| Newsletter asset host (GitHub upload — PNGs + newsletter.html + newsletter.md + summary.md) | `src/manager/libraries/email/generators/lib/image-host.js` |
| Newsletter markdown renderer (programmatic, no AI) | `src/manager/libraries/email/generators/lib/markdown-renderer.js` |
| Ghostii article engine (writeArticle + publishArticle) | `src/manager/libraries/content/ghostii.js` |
| Standalone blog article cron (off by default) | `src/manager/events/cron/daily/blog-auto-publisher.js` |
| Unified AI library | `src/manager/libraries/ai/index.js` (OpenAI + Anthropic via `Manager.AI(assistant).request({ provider, ... })`) |
| Notification library | `src/manager/libraries/notification.js` |
| SendGrid provider | `src/manager/libraries/email/providers/sendgrid.js` |
| Beehiiv provider | `src/manager/libraries/email/providers/beehiiv.js` |
| Campaign routes | `src/manager/routes/marketing/campaign/{get,post,put,delete}.js` |
| Campaign + newsletter cron | `src/manager/events/cron/frequent/marketing-campaigns.js` |
| Pruning cron | `src/manager/events/cron/daily/marketing-prune.js` |
| Seed campaigns | `src/cli/commands/setup-tests/helpers/seed-campaigns.js` |
