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
 * @param {object} options.userDoc - User document data (passed as `to` — email.js extracts email/name and user template data)
 * @param {object} options.assistant - Assistant instance
 */
function sendOrderEmail({ template, subject, categories, data, userDoc, assistant, copy, sender = 'orders' }) {
  const email = assistant.Manager.Email(assistant);
  const uid = userDoc?.auth?.uid;

  if (!userDoc?.auth?.email) {
    assistant.error(`sendOrderEmail(): No email found for uid=${uid}, skipping`);
    return;
  }

  email.send({
    sender,
    to: userDoc,
    subject,
    template,
    categories,
    copy: copy !== false,
    data,
  })
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
