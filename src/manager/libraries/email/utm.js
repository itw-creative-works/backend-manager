/**
 * UTM link tagging for email HTML content
 *
 * Scans HTML for <a href> tags and appends UTM parameters for attribution tracking.
 * Tags all HTTP/HTTPS links — not just brand-domain links.
 *
 * Used by: marketing/index.js (campaigns), transactional/index.js (emails),
 *          mjml-template.js (renderEmail, renderNewsletter)
 */

const DEFAULT_UTM = {
  utm_source: null,    // Defaults to brand.id at runtime
  utm_medium: 'email',
  utm_campaign: null,  // Defaults to campaign name or email template
};

/**
 * Append UTM parameters to all HTTP/HTTPS links in the HTML.
 *
 * @param {string} html - HTML content with <a href="..."> links
 * @param {object} options
 * @param {string} options.brandId - Brand ID (e.g., 'somiibo') — used as default utm_source
 * @param {string} [options.brandUrl] - Brand URL (unused — kept for call-site compat)
 * @param {string} [options.campaign] - Campaign/template name — used as default utm_campaign
 * @param {string} [options.type] - 'marketing' or 'transactional' — used as utm_content
 * @param {object} [options.utm] - Override/additional UTM params (e.g., { utm_term: 'spring' })
 * @returns {string} HTML with UTM params appended to all HTTP links
 */
function tagLinks(html, options) {
  if (!html || !options.brandId) {
    return html;
  }

  // Build UTM params
  const utm = {
    ...DEFAULT_UTM,
    utm_source: options.brandId || DEFAULT_UTM.utm_source,
    utm_campaign: options.campaign || DEFAULT_UTM.utm_campaign,
    utm_content: options.type || undefined,
    ...options.utm,
  };

  // Remove null/undefined values and sanitize: lowercase, non-alphanumeric → underscore
  const utmParams = {};

  for (const [key, value] of Object.entries(utm)) {
    if (value != null && value !== '') {
      utmParams[key] = String(value).toLowerCase().replace(/[''`]/g, '').replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }
  }

  if (!Object.keys(utmParams).length) {
    return html;
  }

  // Replace href values in <a> tags (HTTP/HTTPS only, skip ESP substitution tags)
  return html.replace(/<a\s([^>]*?)href=["']([^"']+)["']/gi, (match, before, href) => {
    try {
      if (href.includes('<%')) {
        return match;
      }

      const url = new URL(href);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return match;
      }

      // Append UTM params (don't override existing ones)
      for (const [key, value] of Object.entries(utmParams)) {
        if (!url.searchParams.has(key)) {
          url.searchParams.set(key, value);
        }
      }

      return `<a ${before}href="${url.toString()}"`;
    } catch (e) {
      return match;
    }
  });
}

module.exports = {
  tagLinks,
  DEFAULT_UTM,
};
