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
| `src/manager/libraries/content/ghostii.js` | `writeArticle()`, `publishArticle()`, `blocksToPost()` -- Ghostii API client + post transform |
| `src/manager/libraries/content/feed-parser.js` | `parseFeed()`, `extractArticleContent()` -- RSS/Atom/JSON parser + article extractor |
| `src/manager/events/cron/daily/blog-auto-publisher.js` | Daily cron: source resolution, feed processing, Firestore tracking, provider dispatch |
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
3. Filter to unprocessed items, pick the newest
4. Extract full article content from the item URL via `feed-parser.extractArticleContent()`
5. Pass extracted text as `sourceContent` to the provider API (separate from the `description` prompt)
6. After publish, write a tracking doc to `content-sources/{hash}`
7. On failure (feed unreachable, unparseable, exhausted): fall back to `$brand` behavior

### Parent source flow

1. Fetch available sources from parent server via `GET {parentUrl}/newsletter-sources` (no `claimFor` -- read-only)
2. Query `content-sources` in Firestore for already-used sources with `origin: '$parent'`
3. Filter out already-used sources, pick the first available
4. On failure (no parent URL, no sources, all exhausted): fall back to `$brand` behavior

### Content source tracking

Collection: `content-sources` (consumer project Firestore)

Unified tracker for all source types -- shared between blog-auto-publisher and newsletter generator.

```js
content-sources/{sha256(origin + '::' + url).slice(0,20)}: {
  url: 'https://...',            // unique identifier (article URL or source ID)
  origin: '$feed:https://...',   // or '$parent', '$brand'
  feedUrl: 'https://...',        // for feed sources
  itemId: 'guid-or-url',
  itemTitle: '...',
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

## Tests

```bash
npx mgr test bem:helpers/content/feed-parser          # 32 tests: RSS/Atom/JSON parsing, edge cases, HTML extraction
npx mgr test bem:helpers/content/ghostii-write-article # 15 tests: override pass-through, sourceContent, backwards compat
npx mgr test bem:helpers/content/blog-auto-publisher   # 25+ tests: source detection, feed processing, Firestore tracking
npx mgr test bem:helpers/content/ghostii-blocks        # 8 tests: blocksToPost() (unchanged)
```
