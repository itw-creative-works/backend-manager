/**
 * Shared helpers for campaign/transactional email templates.
 * Minimal — just the utilities that card/plain/order/feedback need.
 */

const DEFAULT_SPACING = {
  gutter: '32px',
  sectionGap: '24px',
  ruleColor: '#e8e8ec',
};

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveTheme(theme, overrides) {
  return {
    ...theme,
    spacing: {
      ...DEFAULT_SPACING,
      ...(theme?.spacing || {}),
      ...(overrides || {}),
    },
  };
}

function formatAddress(address) {
  if (!address) {
    return '';
  }

  if (typeof address === 'string') {
    return address;
  }

  const parts = [];

  if (address.line1) parts.push(address.line1);
  if (address.line2) parts.push(address.line2);

  const cityLine = [
    address.city,
    [address.region, address.postalCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  if (cityLine) parts.push(cityLine);
  if (address.country) parts.push(address.country);

  return parts.join(', ');
}

module.exports = {
  DEFAULT_SPACING,
  escape,
  resolveTheme,
  formatAddress,
};
