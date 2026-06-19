# Ghostii Article Publisher

The Ghostii system generates and publishes blog posts via the daily `bm_cronDaily` cron job. Two independent paths:

1. **Standalone publisher** — `config.ghostii[]` entries: daily cron picks sources, calls the Ghostii AI API, publishes via `admin/post`.
2. **Newsletter-linked articles** — `marketing.newsletter.content.article.enabled`: the newsletter generator expands its lead section into a full blog post via Ghostii.

This doc covers the standalone publisher. For newsletter integration, see [marketing-campaigns.md](marketing-campaigns.md).

## Architecture

```
config.ghostii[] entry
  ↓
ghostii-auto-publisher cron (daily)
  ↓ (per entry, per article)
resolveSource() — detect source type, fetch/parse if needed
  ↓
writeArticle() — call Ghostii AI API (api.ghostii.ai/write/article)
  ↓
publishArticle() — POST to admin/post → GitHub commit
  ↓
trackFeedItem() — Firestore (for $feed: sources only)
```

### Key files

| File | Purpose |
|---|---|
| `src/manager/libraries/content/ghostii.js` | `writeArticle()`, `publishArticle()`, `blocksToPost()` — API client + post transform |
| `src/manager/libraries/content/feed-parser.js` | `parseFeed()`, `extractArticleContent()` — RSS/Atom/JSON parser + article extractor |
| `src/manager/events/cron/daily/ghostii-auto-publisher.js` | Daily cron: source resolution, feed processing, Firestore tracking |
| `src/manager/routes/admin/post/post.js` | Publishing endpoint: image download + resize, GitHub commit |

## Source Types

Each `ghostii[]` entry has a `sources` array. The cron picks one at random per article.

| Source | Format | Behavior |
|---|---|---|
| Generic topic | `'$app'` | Prompts Ghostii to write about any topic relevant to the brand |
| RSS/Atom feed | `'$feed:https://example.com/feed/'` | Parses feed, picks one unprocessed article, extracts content, passes as `sourceContent` to Ghostii |
| URL | `'https://example.com/page'` | Fetches page HTML, extracts body text, uses as prompt seed |
| Text | `'Write about blockchain'` | Uses directly as prompt seed |

### Feed source flow

1. Fetch and parse the RSS/Atom/JSON feed via `feed-parser.parseFeed()`
2. Query `ghostii-sources` in Firestore for already-processed items
3. Filter to unprocessed items, pick the newest
4. Extract full article content from the item URL via `feed-parser.extractArticleContent()`
5. Pass extracted text as `sourceContent` to the Ghostii API (separate from the `description` prompt)
6. After publish, write a tracking doc to `ghostii-sources/{hash}`
7. On failure (feed unreachable, unparseable, exhausted): fall back to `$app` behavior

### Feed item tracking

Collection: `ghostii-sources` (consumer project Firestore)

```js
ghostii-sources/{sha256(feedUrl + '::' + itemId).slice(0,20)}: {
  feedUrl: 'https://...',
  itemId: 'guid-or-url',
  itemUrl: 'https://...',
  itemTitle: '...',
  brandId: '...',
  postUrl: '...',
  postSlug: '...',
  metadata: {
    created: { timestamp: '...ISO...', timestampUNIX: 1234567890 },
    updated: { timestamp: '...ISO...', timestampUNIX: 1234567890 },
  },
  metadata: { created: Timestamp },
}
```

## Configuration

```js
// backend-manager-config.json
ghostii: [
  {
    articles: 1,                    // articles per cron run (0 = disabled)
    sources: ['$app'],              // source pool (mixed types OK)
    links: [],                      // URLs to inject into article body
    prompt: '',                     // custom instructions for the AI
    chance: 1.0,                    // probability of running (0-1)
    author: null,                   // author slug (null = admin/post default)
    postPath: 'ghostii',            // sub-folder under _posts/{year}/
    overrides: {                    // per-entry Ghostii API param overrides
      // keywords: ['AI'],
      // length: 'long',            // short | medium | long | comprehensive
      // research: true,            // web search for real links
      // insertImages: true,
      // insertLinks: true,
      // headerImageUrl: 'unsplash', // disabled | unsplash | generate
      // maxLinks: 6,
      // sectionQuantity: 5,
      // feedUrl: '',               // brand blog feed (title dedup)
    },
    // brand: 'other-brand-id',     // cross-brand publishing
    // brandUrl: 'https://api.other.com',
  }
]
```

### Per-entry overrides

All Ghostii API params were previously hardcoded in `writeArticle()`. They now accept per-entry overrides via the `overrides` object. Unspecified values fall back to framework defaults (length: 'long', research: true, etc.).

### `sourceContent` — Ghostii API field

When a `$feed:` source provides extracted article text, it's passed to the Ghostii API as `sourceContent` (max 16KB). This is separate from `description` (the editorial brief, max 2KB). Ghostii's title generation, outline, and section writing prompts reference the source content as context for writing original articles — not rewrites.

## Feed Parser

`src/manager/libraries/content/feed-parser.js` exports:

- **`parseFeed(text)`** — Parse RSS 2.0, Atom 1.0, or JSON Feed into `{ items: [{ id, title, url, summary, content, publishedAt }] }`. Handles CDATA, namespaced elements (`content:encoded`), BOM, attribute-based links. Returns `{ items: [] }` on invalid input.

- **`extractArticleContent(url)`** — Fetch URL, extract readable text from `<article>` → `<main>` → `<body>`, strip scripts/styles/nav/footer/header/aside, normalize whitespace, truncate to 14KB.

## Tests

```bash
npx mgr test bem:helpers/content/feed-parser         # 32 tests: RSS/Atom/JSON parsing, edge cases, HTML extraction
npx mgr test bem:helpers/content/ghostii-write-article # 15 tests: override pass-through, sourceContent, backwards compat
npx mgr test bem:helpers/content/ghostii-auto-publisher # 20 tests: source detection, feed processing, Firestore tracking
npx mgr test bem:helpers/content/ghostii-blocks        # 8 tests: blocksToPost() (unchanged)
```
