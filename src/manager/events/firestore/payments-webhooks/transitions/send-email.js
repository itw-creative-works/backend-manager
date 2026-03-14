/**
 * Shared email helper for payment transition handlers
 * Sends transactional order emails directly via the shared email library (no HTTP round-trip)
 */
const moment = require('moment');

/**
 * Send an order email directly using the shared email library (fire-and-forget)
 *
 * @param {object} options
 * @param {string} options.template - SendGrid dynamic template ID
 * @param {string} options.subject - Email subject line
 * @param {string[]} options.categories - SendGrid categories for filtering
 * @param {object} options.data - Template data (passed as-is to the email)
 * @param {object} options.userDoc - User document data (already fetched by on-write.js)
 * @param {object} options.assistant - Assistant instance
 */
function sendOrderEmail({ template, subject, categories, data, userDoc, assistant, copy, sender = 'orders' }) {
  const email = assistant.Manager.Email(assistant);

  const userEmail = userDoc?.auth?.email;
  const userName = userDoc?.personal?.name?.first;
  const uid = userDoc?.auth?.uid;

  if (!userEmail) {
    assistant.error(`sendOrderEmail(): No email found for uid=${uid}, skipping`);
    return;
  }

  // Strip sensitive fields before passing to email template
  const safeUser = { ...userDoc };
  delete safeUser.api;
  delete safeUser.oauth2;
  delete safeUser.activity;
  delete safeUser.affiliate;
  delete safeUser.attribution;
  delete safeUser.flags;

  const settings = {
    sender,
    to: { email: userEmail, ...(userName && { name: userName }) },
    subject,
    template,
    categories,
    copy: copy !== false,
    user: safeUser,
    data,
  };

  email.send(settings)
    .then((result) => {
      assistant.log(`sendOrderEmail(): Success template=${template}, uid=${uid}, status=${result.status}`);
    })
    .catch((e) => {
      assistant.error(`sendOrderEmail(): Failed template=${template}, uid=${uid}: ${e.message}`);
    });
}

/**
 * Format an ISO timestamp or Unix timestamp to display format
 *
 * @param {string|number} timestamp - ISO string or Unix timestamp (seconds)
 * @returns {string} Formatted date (e.g., 'Feb 25, 2026')
 */
function formatDate(timestamp) {
  if (!timestamp) {
    return '';
  }

  // Unix timestamp (number or numeric string)
  if (typeof timestamp === 'number' || /^\d+$/.test(timestamp)) {
    return moment.unix(Number(timestamp)).utc().format('MMM D, YYYY');
  }

  return moment(timestamp).utc().format('MMM D, YYYY');
}

module.exports = {
  sendOrderEmail,
  formatDate,
};
