/**
 * Feedback template — emoji rating card with gift card incentive.
 * Matches the original SendGrid feedback template: 🎉 header, gift card copy,
 * 4 rating faces (dislike/neutral/like/love), CTA button, support help text.
 */
const { skeleton, logo, cardWrapper, signoff, footer, escape } = require('./base.js');

const RATING_IMAGES = {
  dislike: 'https://cdn.itwcreativeworks.com/assets/general/images/feedback/dislike.png',
  neutral: 'https://cdn.itwcreativeworks.com/assets/general/images/feedback/neutral.png',
  like: 'https://cdn.itwcreativeworks.com/assets/general/images/feedback/like.png',
  love: 'https://cdn.itwcreativeworks.com/assets/general/images/feedback/love.png',
};

function build({ data, theme }) {
  const brand = data?.brand || {};
  const brandName = brand.name || '';
  const brandUrl = brand.url || '#';
  const email = data?.email || {};
  const name = data?.personalization?.name;

  const feedbackUrl = `${brandUrl}/feedback`;
  const utm = 'utm_source=feedback-request-email&utm_medium=email&utm_campaign=amazon-100-giftcard-promo';

  return skeleton({ subject: email.subject, preview: email.preview, categories: email.categories }, `
    ${logo(brand, theme)}
    ${cardWrapper(`
        <!-- Header -->
        <mj-text padding="0" align="center">
          <p style="font-size: 48px; line-height: 1; margin: 0 0 12px;">&#127881;</p>
          <h2 style="font-size: 32px; line-height: 1.2; font-weight: 500; margin: 0 0 8px;">Win a $100 Amazon Gift Card!</h2>
          <p style="color: #718096; margin: 0 0 0;">${name ? `Hey ${escape(name)}, share` : 'Share'} your honest feedback on ${escape(brandName)}.</p>
        </mj-text>

        <!-- Explanation -->
        <mj-text padding="20px 0 0 0">
          <p style="color: #718096;">We hope you are enjoying <strong>${escape(brandName)}</strong>! We are always looking for ways to improve and would <strong>love to hear your feedback</strong>.</p>
          <p style="color: #718096;">We're giving away a <strong>$100 Amazon Gift Card</strong> to one lucky winner who provides us with their honest feedback.</p>
        </mj-text>

        <!-- Rating Label -->
        <mj-text padding="24px 0 8px 0">
          <p style="font-weight: 700; font-size: 12px; color: #718096; letter-spacing: 0.5px; margin: 0;">HOW WOULD YOU RATE US?</p>
        </mj-text>

        <!-- Rating Faces -->
        <mj-text padding="0">
          <div style="background-color: #F7FAFC; border-radius: 8px; padding: 20px;">
            <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
              <tr>
                ${_ratingCell('dislike', 'Poor', feedbackUrl, utm)}
                ${_ratingCell('neutral', '', feedbackUrl, utm)}
                ${_ratingCell('like', '', feedbackUrl, utm)}
                ${_ratingCell('love', 'Excellent', feedbackUrl, utm)}
              </tr>
            </table>
          </div>
        </mj-text>

        <!-- CTA Button -->
        <mj-button href="${escape(feedbackUrl)}?${utm}" background-color="#1A202C" color="#ffffff" border-radius="4px" font-size="16px" font-weight="normal" inner-padding="10px 20px" padding="24px 0 0 0">I want to win a $100 Amazon Gift Card!</mj-button>

        <!-- Help Text -->
        <mj-text padding="16px 0 0 0" align="center">
          <p style="color: #718096; margin: 0;">Your feedback helps us improve. <a href="${brandUrl}/support">Contact our support team</a> if you need help.</p>
        </mj-text>

        ${signoff(data, theme)}
    `)}
    ${footer(brand, email)}
  `);
}

function _ratingCell(rating, label, feedbackUrl, utm) {
  const url = `${feedbackUrl}?rating=${rating}&${utm}`;
  const img = RATING_IMAGES[rating];
  const labelStyle = label
    ? 'font-size: 11px; color: #888; margin-top: 4px;'
    : 'font-size: 11px; color: transparent; margin-top: 4px;';

  return `<td style="text-align: center; padding: 4px; width: 25%; vertical-align: top;">
    <a href="${url}" style="text-decoration: none; display: inline-block;">
      <img src="${img}" alt="${rating}" width="48" style="width: 48px; height: 48px; display: block; margin: 0 auto;" />
      <div style="${labelStyle}">${label || '&nbsp;'}</div>
    </a>
  </td>`;
}

const meta = {
  name: 'feedback',
  description: 'Feedback request — rating faces with gift card incentive',
};

module.exports = { build, meta };
