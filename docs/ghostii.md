# Blog Auto-Publisher (Ghostii Provider)

The blog system generates and publishes blog posts via the daily `bm_cronDaily` cron job. Two independent paths:

1. **Standalone publisher** — `config.blog` with `enabled: true`: daily cron picks sources, calls the configured platform provider (default: Ghostii AI API), publishes via `admin/post`.
2. **Newsletter-linked articles** — `marketing.newsletter.content.article.enabled`: the newsletter generator expands its lead section into a full blog post via Ghostii.

This doc covers the standalone publisher. For newsletter integration, see [marketing-campaigns.md](marketing-campaigns.md).

## Architecture

```
config.blog.content[] entry
  |
blog-auto-publisher cron (daily)
  | (per entry, per article)
resolveSource() -- detect source type, fetch/parse if needed
  |
provider.writeArticle() -- call provider API (e.g. Ghostii: api.ghostii.ai/write/article)
  |
provider.publishArticle() -- POST to admin/post -> GitHub commit
  |
trackContentSource() -- Firestore (for $feed:, $parent sources)
```

### Key files

| File | Purpose |
|---|---|
| `src/manager/libraries/content/source-resolver.js` | **Shared SSOT**: prompt templates, anti-traceability rules, feed/parent resolution, Firestore tracking, fallback chain. Used by both blog + newsletter. |
| `src/manager/libraries/content/ghostii.js` | `writeArticle()`, `publishArticle()`, `blocksToPost()` -- Ghostii API client + post transform |
| `src/manager/libraries/content/feed-parser.js` | `parseFeed()`, `extractArticleContent()` -- RSS/Atom/JSON parser + article extractor |
| `src/manager/events/cron/daily/blog-auto-publisher.js` | Daily cron: imports from source-resolver, manages harvest loop + provider dispatch |
| `src/manager/routes/admin/post/post.js` | Publishing endpoint: image download + resize, GitHub commit |

## Source Types

Each `blog.content[]` entry has a `sources` array. The cron picks one at random per article.

| Source | Format | Behavior |
|---|---|---|
| Generic topic | `'$brand'` | Prompts the provider to write about any topic relevant to the brand |
| RSS/Atom feed | `'$feed:https://example.com/feed/'` | Parses feed, picks one unprocessed article, extracts content, passes as `sourceContent` to the provider |
| Parent server | `'$parent'` | Fetches sources from parent server's source pool (without claiming), filters out already-used sources locally |
| URL | `'https://example.com/page'` | Fetches page HTML, extracts body text, uses as prompt seed |
| Text | `'Write about blockchain'` | Uses directly as prompt seed |

### Feed source flow

1. Fetch and parse the RSS/Atom/JSON feed via `feed-parser.parseFeed()`
2. Query `content-sources` in Firestore for already-processed items
3. Filter to unprocessed items; also filter items whose title is too similar to recently published articles (cross-feed dedup via `isTitleTooSimilar`)
4. Pick the first remaining item
5. Extract full article content from the item URL via `feed-parser.extractArticleContent()`
6. Pass extracted text as `sourceContent` to the provider API (separate from the `description` prompt)
7. After publish, write a tracking doc to `content-sources/{hash}`
8. On failure (feed unreachable, unparseable, exhausted): return null so `harvest()` tries the next source. Only falls back to `$brand` if `$brand` is explicitly in the entry's `sources` array.

### Parent source flow

1. Fetch available sources from parent server via `GET {parentUrl}/newsletter-sources` (no `claimFor` -- read-only)
2. Query `content-sources` in Firestore for already-used sources with `origin: '$parent'`
3. Filter out already-used sources, pick the first available
4. On failure (no parent URL, no sources, all exhausted): return null so `harvest()` tries the next source. Only falls back to `$brand` if `$brand` is explicitly in the entry's `sources` array.

### Content source tracking

Collection: `content-sources` (consumer project Firestore)

Unified tracker for all source types -- shared between blog-auto-publisher and newsletter generator.

```js
content-sources/{sha256(origin + '::' + url).slice(0,20)}: {
  url: 'https://...',            // unique identifier (article URL or source ID)
  origin: '$feed:https://...',   // or '$parent', '$brand'
  feedUrl: 'https://...',        // for feed sources
  itemId: 'guid-or-url',
  itemTitle: '...',              // source article title
  postTitle: '...',              // generated article title (for topic dedup)
  usedBy: 'blog',               // or 'newsletter'
  brandId: '...',
  postUrl: '...',
  postSlug: '...',
  metadata: {
    created: { timestamp: '...ISO...', timestampUNIX: 1234567890 },
    updated: { timestamp: '...ISO...', timestampUNIX: 1234567890 },
  },
}
```

### Topic deduplication

The blog auto-publisher prevents near-duplicate articles at three levels:

1. **Per-feed dedup**: `processFeedSource()` queries `content-sources` by `feedUrl` to skip items already used from that specific feed.

2. **Cross-feed dedup** (structural): Before picking a feed item, `processFeedSource()` compares each candidate's title against ALL recent titles (from any source) using `isTitleTooSimilar()` — a word-overlap check with basic stemming. This catches the same news event reported by different publications (e.g. Guardian and NYT both covering Apple's price hike). Items with >= 50% significant-word overlap are skipped.

3. **Topic dedup** (prompt-based): Before generating each article, `harvest()` appends all recent titles (Firestore history + same-run) to the Ghostii prompt as a strict avoidance list. The prompt forbids writing about the same topic, theme, or keyword combination — not just the same story.

Within a single cron run, both generated post titles AND source item titles are tracked in `runTitles` and fed into levels 2 and 3 for subsequent articles.

All source types (`$feed`, `$parent`, `$brand`, URL, text) are tracked in `content-sources` after publishing.

### Source fallback behavior

When a source fails or is exhausted, `resolveSource()` only falls back to `$brand` if `$brand` is explicitly listed in the entry's `sources` array. Otherwise it returns null, and `harvest()` tries the next source in a shuffled copy of the pool. If all sources are exhausted, that article slot is skipped.

## Configuration

```js
// backend-manager-config.json
blog: {
  enabled: false,
  platform: 'ghostii',           // provider: only 'ghostii' for now
  content: [
    {
      quantity: 1,                // articles per cron run (0 = disabled)
      sources: ['$brand'],        // source pool (mixed types OK)
      links: [],                  // URLs to inject into article body
      instructions: '',           // custom instructions for the AI
      tone: 'professional',       // 'professional', 'casual', 'actionable', etc.
      categories: [],             // topic constraints + output tags
      keywords: [],               // SEO keywords to weave in
      chance: 1.0,                // probability of running (0-1)
      author: null,               // author slug (null = admin/post default)
      postPath: 'blog',           // sub-folder under _posts/{year}/
      overrides: {                // per-entry Ghostii API param overrides
        // keywords: ['AI'],
        // length: 'long',        // short | medium | long | comprehensive
        // research: true,        // web search for real links
        // insertImages: true,
        // insertLinks: true,
        // headerImageUrl: 'unsplash', // disabled | unsplash | generate
        // maxLinks: 6,
        // sectionQuantity: 5,
        // feedUrl: '',           // brand blog feed (title dedup)
      },
      // brand: 'other-brand-id',     // cross-brand publishing
      // brandUrl: 'https://api.other.com',
    }
  ],
}
```

### Per-entry overrides

All Ghostii API params were previously hardcoded in `writeArticle()`. They now accept per-entry overrides via the `overrides` object. Unspecified values fall back to framework defaults (length: 'long', research: true, etc.).

### Keywords resolution

Keywords are resolved in this order:
1. `overrides.keywords` -- per-entry Ghostii API override (highest priority)
2. `entry.keywords` -- top-level entry keywords (used if overrides.keywords is not set)
3. Empty array -- framework default

### `sourceContent` -- Ghostii API field

When a `$feed:` or `$parent` source provides extracted article text, it's passed to the Ghostii API as `sourceContent` (max 16KB). This is separate from `description` (the editorial brief, max 2KB). Ghostii's title generation, outline, and section writing prompts reference the source content as context for writing original articles -- not rewrites.

## Feed Parser

`src/manager/libraries/content/feed-parser.js` exports:

- **`parseFeed(text)`** -- Parse RSS 2.0, Atom 1.0, or JSON Feed into `{ items: [{ id, title, url, summary, content, publishedAt }] }`. Handles CDATA, namespaced elements (`content:encoded`), BOM, attribute-based links. Returns `{ items: [] }` on invalid input.

- **`extractArticleContent(url)`** -- Fetch URL, extract readable text from `<article>` -> `<main>` -> `<body>`, strip scripts/styles/nav/footer/header/aside, normalize whitespace, truncate to 14KB.

## Prompt Templates (source-resolver.js)

Both blog and newsletter use shared prompt constants from `source-resolver.js`:

- **`PROMPT_SOURCE`** — used when a `$feed:` or `$parent` source is resolved. Directs the AI to cover the SAME topic with a different angle, title, and structure. Includes anti-traceability rules.
- **`PROMPT`** — used for `$brand`, URL, and text sources. Open-ended topic generation.
- **`ANTI_TRACEABILITY`** — shared rules: never name the source publication, paraphrase all data. Embedded in `PROMPT_SOURCE`, also used by the newsletter's system prompt.

The brand's `instructions` field is injected into both templates and can override the default behavior (e.g. a brand that WANTS genericized output can say so in instructions).

## Tests

### Unit tests (fast, free)

```bash
npx mgr test mgr:helpers/content/feed-parser          # 32 tests: RSS/Atom/JSON parsing, edge cases
npx mgr test mgr:helpers/content/ghostii-write-article # 15 tests: override pass-through, sourceContent
npx mgr test mgr:helpers/content/blog-auto-publisher   # 25+ tests: source detection, feed processing, tracking
npx mgr test mgr:helpers/content/ghostii-blocks        # 8 tests: blocksToPost()
```

### Blog generation (full AI pipeline)

```bash
# Config check only (fast, free)
npx mgr test mgr:content/blog-generate

# Full AI pipeline — generates article, does NOT publish
BLOG_NO_PUBLISH=1 TEST_EXTENDED_MODE=1 npx mgr test mgr:content/blog-generate

# Override source type
BLOG_SOURCE='$feed:https://feeds.arstechnica.com/arstechnica/index' \
  BLOG_NO_PUBLISH=1 TEST_EXTENDED_MODE=1 npx mgr test mgr:content/blog-generate
```

| Env var | Description |
|---|---|
| `TEST_EXTENDED_MODE=1` | Enable full AI pipeline (costs ~$0.10-0.50 per run) |
| `BLOG_NO_PUBLISH=1` | Generate but do NOT publish to website repo |
| `BLOG_SOURCE=<type>` | Override source: `$brand`, `$parent`, `$feed:<url>`, URL, or text |
| `BLOG_OPEN=1` | Auto-open generated article (macOS only) |

### Newsletter generation (full AI pipeline)

```bash
# Fixture render only (fast, free)
npx mgr test mgr:email/newsletter-generate

# Full AI pipeline with feed source — generates newsletter, does NOT publish article
NEWSLETTER_SOURCE='$feed:https://feeds.arstechnica.com/arstechnica/index' \
  NEWSLETTER_NO_IMAGES=1 TEST_EXTENDED_MODE=1 npx mgr test mgr:email/newsletter-generate
```

| Env var | Description |
|---|---|
| `TEST_EXTENDED_MODE=1` | Enable full AI pipeline |
| `NEWSLETTER_SOURCE=<type>` | Override source: `$feed:<url>`, `$parent`. Bypasses parent-server fetch, lets the generator's resolver run. |
| `NEWSLETTER_NO_IMAGES=1` | Skip image generation (fast iteration on copy) |
| `NEWSLETTER_CREATE_ARTICLE=1` | Publish linked blog article (OFF by default) |
| `NEWSLETTER_FIXTURE=<name>` | Load specific fixture for render test |
| `NEWSLETTER_TEMPLATE=<name>` | Override layout template |
| `NEWSLETTER_OPEN=1` | Auto-open preview (macOS only) |
| `NEWSLETTER_PEEK=1` | List ready parent sources, don't generate |
| `NEWSLETTER_SOURCE_ID=<id>` | Test specific parent source |
| `NEWSLETTER_CAMPAIGN_ID=<id>` | Override campaign folder name |
