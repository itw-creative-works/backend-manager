/**
 * POST /general/email - Send templated email
 * Public endpoint to send email using predefined templates
 */
const path = require('path');
const { merge } = require('lodash');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const settings = assistant.settings;
  const fetch = Manager.require('wonderful-fetch');

  // Validate required parameters
  if (!settings.id) {
    return assistant.respond('Parameter {id} is required.', { code: 400 });
  }
  if (!settings.email) {
    return assistant.respond('Parameter {email} is required.', { code: 400 });
  }

  const DEFAULT = {
    spamFilter: {
      ip: 3,
      email: 3,
    },
    delay: 1,
    payload: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      app: Manager.config.app.id,
    },
  };

  // Load email template
  let emailPayload;
  try {
    const script = require(path.join(__dirname, 'templates', `${settings.id}.js`));
    emailPayload = merge(
      {},
      DEFAULT,
      script(settings, Manager.config),
    );
  } catch (e) {
    return assistant.respond(`${settings.id} is not a valid email ID.`, { code: 400 });
  }

  // Check spam filter using local storage
  const storage = Manager.storage({ temporary: true });
  const ipPath = ['api:general:email', 'ips', assistant.request.geolocation.ip];
  const emailPath = ['api:general:email', 'emails', settings.email];

  const ipData = storage.get(ipPath).value() || {};
  const emailData = storage.get(emailPath).value() || {};

  ipData.count = (ipData.count || 0) + 1;
  ipData.firstRequestTime = ipData.firstRequestTime || new Date().toISOString();
  ipData.lastRequestTime = new Date().toISOString();

  emailData.count = (emailData.count || 0) + 1;
  emailData.firstRequestTime = emailData.firstRequestTime || new Date().toISOString();
  emailData.lastRequestTime = new Date().toISOString();

  storage.set(ipPath, ipData).write();
  storage.set(emailPath, emailData).write();

  assistant.log('Storage:', storage.getState()['api:general:email']);

  // Check spam thresholds
  if (ipData.count >= emailPayload.spamFilter.ip || emailData.count >= emailPayload.spamFilter.email) {
    assistant.error(`Spam filter triggered ip=${ipData.count}, email=${emailData.count}`);
    return assistant.respond({ success: true });
  }

  // Add delay if specified
  if (emailPayload.delay) {
    emailPayload.payload.sendAt = Math.round((new Date().getTime() + emailPayload.delay) / 1000);
  }

  assistant.log('Email payload:', emailPayload);

  // Send the email via NEW admin/email API
  const result = await fetch(`${Manager.project.apiUrl}/backend-manager/admin/email`, {
    method: 'post',
    response: 'json',
    log: true,
    headers: {
      'Authorization': `Bearer ${process.env.BACKEND_MANAGER_KEY}`,
    },
    body: emailPayload.payload,
  }).catch(e => e);

  if (result instanceof Error) {
    return assistant.respond(`Error sending email: ${result}`, { code: 500, sentry: true });
  }

  assistant.log('Response:', result);

  // Track analytics
  assistant.analytics.event('general/email', { id: settings.id });

  return assistant.respond({ success: true });
};
