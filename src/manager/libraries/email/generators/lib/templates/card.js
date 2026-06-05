/**
 * Card template — the default. Brandmark → white card (title + message + CTA) → signoff → footer.
 */
const { skeleton, logo, cardWrapper, signoff, button, footer, escape } = require('./base.js');

function build({ data, theme }) {
  const brand = data?.brand || {};
  const email = data?.email || {};
  const content = data?.content || {};
  const title = content.title || '';
  const message = content.message || '';

  const titleMjml = title
    ? `<h2 style="font-size: 32px; line-height: 1.2; font-weight: 500; margin: 0 0 8px;">${escape(title)}</h2>`
    : '';

  return skeleton({ subject: email.subject, preview: email.preview, categories: email.categories }, `
    ${logo(brand, theme)}
    ${cardWrapper(`
        <mj-text padding="0">${titleMjml}${message}</mj-text>
        ${button(content.button)}
        ${signoff(data, theme)}
    `)}
    ${footer(brand, email)}
  `);
}

const meta = {
  name: 'card',
  description: 'Branded card layout — the default email template',
};

module.exports = { build, meta };
