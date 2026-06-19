/**
 * Feed Parser — RSS 2.0, Atom 1.0, and JSON Feed parser + article content extractor.
 *
 * Parses standard syndication feeds into a normalized item array and extracts
 * readable article text from URLs. Used by the ghostii-auto-publisher cron to
 * select individual articles from third-party feeds for AI-assisted content
 * generation.
 *
 * @module feed-parser
 */
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');
const fetch = require('wonderful-fetch');

const MAX_CONTENT_LENGTH = 1024 * 14;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Parse an RSS 2.0, Atom 1.0, or JSON Feed string into a normalized item array.
 *
 * @param {string} text - Raw feed text (XML or JSON).
 * @returns {{ items: FeedItem[] }} Normalized feed items. Empty array on unparseable input.
 *
 * @typedef {object} FeedItem
 * @property {string} id - Stable unique identifier (guid / atom:id / url).
 * @property {string} title - Item title.
 * @property {string} url - Link to the full article.
 * @property {string} summary - Short excerpt (max 500 chars, HTML stripped).
 * @property {string} content - Full inline content if available (max 14KB, HTML stripped).
 * @property {string} publishedAt - Publication date string (ISO or RFC-822).
 */
function parseFeed(text) {
  if (!text || typeof text !== 'string') {
    return { items: [] };
  }

  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) {
    return { items: [] };
  }

  // JSON Feed
  try {
    const json = JSON.parse(clean);
    if (json && Array.isArray(json.items)) {
      return { items: normalizeJsonFeed(json.items) };
    }
    return { items: [] };
  } catch (e) {
    // Not JSON — try XML
  }

  // XML (RSS 2.0 / Atom 1.0)
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['item', 'entry'].includes(name),
    });
    const doc = parser.parse(clean);

    if (doc.rss?.channel) {
      return { items: normalizeRss(doc.rss.channel) };
    }

    if (doc.feed) {
      return { items: normalizeAtom(doc.feed) };
    }
  } catch (e) {
    // Unparseable XML
  }

  return { items: [] };
}

/**
 * JSON Feed (jsonfeed.org) + rss.app format normalizer.
 */
function normalizeJsonFeed(items) {
  return (items || []).map((item) => ({
    id: String(item.id || item.url || ''),
    title: String(item.title || ''),
    url: String(item.url || item.link || ''),
    summary: String(item.summary || item.content_text || '').slice(0, 500),
    content: String(item.content_html || item.content_text || '').slice(0, MAX_CONTENT_LENGTH),
    publishedAt: String(item.date_published || item.date_modified || ''),
  })).filter((item) => item.id || item.url);
}

/**
 * RSS 2.0 normalizer — handles <item> with guid, title, link, description, content:encoded, pubDate.
 */
function normalizeRss(channel) {
  const items = channel.item || [];

  return items.map((item) => {
    const link = Array.isArray(item.link) ? item.link[0] : (item.link || '');
    const guid = item.guid?.['#text'] || item.guid || '';

    return {
      id: String(guid || link),
      title: String(item.title || ''),
      url: String(link),
      summary: stripHtml(String(item.description || '')).slice(0, 500),
      content: stripHtml(String(item['content:encoded'] || item.description || '')).slice(0, MAX_CONTENT_LENGTH),
      publishedAt: String(item.pubDate || ''),
    };
  }).filter((item) => item.id || item.url);
}

/**
 * Atom 1.0 normalizer — handles <entry> with id, title, link href, summary, content, published.
 */
function normalizeAtom(feed) {
  const entries = feed.entry || [];

  return entries.map((entry) => {
    const links = Array.isArray(entry.link) ? entry.link : [entry.link].filter(Boolean);
    const altLink = links.find((l) => l?.['@_rel'] === 'alternate' || !l?.['@_rel']);
    const url = altLink?.['@_href'] || links[0]?.['@_href'] || '';

    const title = entry.title?.['#text'] || entry.title || '';
    const summary = entry.summary?.['#text'] || entry.summary || '';
    const content = entry.content?.['#text'] || entry.content || '';

    return {
      id: String(entry.id || url),
      title: String(title),
      url: String(url),
      summary: stripHtml(String(summary)).slice(0, 500),
      content: stripHtml(String(content)).slice(0, MAX_CONTENT_LENGTH),
      publishedAt: String(entry.published || entry.updated || ''),
    };
  }).filter((item) => item.id || item.url);
}

/**
 * Fetch a URL and extract the readable article text from its HTML via Cheerio.
 *
 * Priority: `<article>` → `<main>` → `<body>`. Removes non-content elements
 * (scripts, styles, nav, ads, forms, widgets) before extracting text.
 * Truncates to 14KB.
 *
 * @param {string} url - The article URL to fetch.
 * @returns {Promise<string>} Extracted plain text (empty string on failure).
 */
async function extractArticleContent(url) {
  if (!url) {
    return '';
  }

  const res = await fetch(url, {
    timeout: 30000,
    tries: 2,
    response: 'raw',
    headers: { 'User-Agent': USER_AGENT },
  });

  const html = await res.text();
  if (!html) {
    return '';
  }

  return extractTextFromHtml(html).slice(0, MAX_CONTENT_LENGTH);
}

/**
 * Extract readable text from an HTML string using Cheerio.
 *
 * @param {string} html - Raw HTML string.
 * @returns {string} Clean plain text.
 */
function extractTextFromHtml(html) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, noscript, nav, footer, header, aside, form, button, svg, iframe, figure, figcaption, [role="navigation"], [role="banner"], [role="complementary"], [aria-hidden="true"], .ad, .ads, .advertisement, .social-share, .related-articles, .sidebar').remove();

  // Extract from the most specific content container
  const $content = $('article').length ? $('article')
    : $('main').length ? $('main')
    : $('body');

  const text = $content.text().replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Strip all HTML tags from a string and normalize whitespace.
 *
 * @param {string} html - HTML string to clean.
 * @returns {string} Plain text.
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseFeed, extractArticleContent, extractTextFromHtml, stripHtml };
