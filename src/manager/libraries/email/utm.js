/**
 * UTM link tagging for email HTML content
 *
 * Scans HTML for <a href> tags pointing to the brand's domain
 * and appends UTM parameters for attribution tracking.
 *
 * Used by: marketing/index.js (campaigns), transactional/index.js (emails)
 */

const DEFAULT_UTM = {
  utm_source: null,    // Defaults to brand.id at runtime
  utm_medium: 'email',
  utm_campaign: null,  // Defaults to campaign name or email template
};

/**
 * Append UTM parameters to all links matching the brand's domain(s).
 *
 * @param {string} html - HTML content with <a href="..."> links
 * @param {object} options
 * @param {string} options.brandUrl - Brand URL (e.g., 'https://somiibo.com')
 * @param {string} options.brandId - Brand ID (e.g., 'somiibo') — used as default utm_source
 * @param {string} [options.campaign] - Campaign/template name — used as default utm_campaign
 * @param {string} [options.type] - 'marketing' or 'transactional' — used as utm_content
 * @param {object} [options.utm] - Override/additional UTM params (e.g., { utm_term: 'spring' })
 * @returns {string} HTML with UTM params appended to matching links
 */
function tagLinks(html, options) {
  if (!html || !options.brandUrl) {
    return html;
  }

  // Extract brand hostname(s) to match against
  const brandHostnames = extractHostnames(options.brandUrl);

  if (!brandHostnames.length) {
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

  // Remove null/undefined values
  const utmParams = {};

  for (const [key, value] of Object.entries(utm)) {
    if (value != null && value !== '') {
      utmParams[key] = String(value);
    }
  }

  if (!Object.keys(utmParams).length) {
    return html;
  }

  // Replace href values in <a> tags
  return html.replace(/<a\s([^>]*?)href=["']([^"']+)["']/gi, (match, before, href) => {
    try {
      const url = new URL(href);

      // Only tag links to the brand's domain
      if (!brandHostnames.includes(url.hostname.toLowerCase())) {
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
      // Not a valid URL (relative path, mailto:, etc.) — skip
      return match;
    }
  });
}

/**
 * Extract hostnames from a brand URL.
 * Returns the base domain + www variant.
 *
 * @param {string} brandUrl
 * @returns {string[]}
 */
function extractHostnames(brandUrl) {
  try {
    const url = new URL(brandUrl);
    const hostname = url.hostname.toLowerCase();
    const hostnames = [hostname];

    // Add www variant
    if (hostname.startsWith('www.')) {
      hostnames.push(hostname.slice(4));
    } else {
      hostnames.push(`www.${hostname}`);
    }

    return hostnames;
  } catch (e) {
    return [];
  }
}

module.exports = {
  tagLinks,
  DEFAULT_UTM,
};
