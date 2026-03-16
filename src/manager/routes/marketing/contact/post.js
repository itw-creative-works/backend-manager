/**
 * POST /marketing/contact - Add marketing contact
 * Public endpoint to subscribe to newsletter, with admin options
 */
const recaptcha = require('../../../libraries/recaptcha.js');
const { validate: validateEmail, ALL_CHECKS } = require('../../../libraries/email/validation.js');
const { inferContact } = require('../../../libraries/infer-contact.js');
const { DEFAULT_PROVIDERS } = require('../../../libraries/email/constants.js');

module.exports = async ({ assistant, Manager, settings, analytics }) => {

  // Initialize Usage to check auth level
  const usage = await Manager.Usage().init(assistant, {
    unauthenticatedMode: 'firestore',
  });
  const isAdmin = usage.user.roles?.admin;

  // Extract parameters
  const email = (settings.email || '').trim().toLowerCase();
  let firstName = (settings.firstName || '').trim();
  let lastName = (settings.lastName || '').trim();
  const source = settings.source;

  // Admin-only options
  const tags = isAdmin ? settings.tags : [];
  const providers = isAdmin ? settings.providers : DEFAULT_PROVIDERS;
  const skipValidation = isAdmin ? settings.skipValidation : false;

  // Email validation — run free checks before reCAPTCHA/rate limit
  const shouldCallExternalAPIs = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  // skipValidation (admin-only) reduces to just format + disposable
  // Admin gets full checks including mailbox verification when external APIs are enabled
  const checks = skipValidation
    ? ['format']
    : (isAdmin && shouldCallExternalAPIs ? ALL_CHECKS : undefined);

  const validation = await validateEmail(email, { checks });

  if (!validation.valid) {
    // For public requests, return generic success to prevent email enumeration
    if (!isAdmin) {
      return assistant.respond({ success: true });
    }

    const { format, localPart, disposable } = validation.checks;

    if (format && !format.valid) {
      return assistant.respond('Invalid email format', { code: 400 });
    }

    if (localPart && !localPart.valid) {
      return assistant.respond(`Blocked email local part: ${localPart.localPart}`, { code: 400 });
    }

    if (disposable && !disposable.valid) {
      return assistant.respond(`Disposable email domain not allowed: ${disposable.domain}`, { code: 400 });
    }

    return assistant.respond('Email validation failed', { code: 400 });
  }

  // Public access protection (after validation so we don't waste reCAPTCHA on garbage)
  if (!isAdmin) {
    // Verify reCAPTCHA (skip during automated tests)
    if (!assistant.isTesting()) {
      const recaptchaToken = settings['g-recaptcha-response'];
      if (!recaptchaToken) {
        return assistant.respond('Request could not be verified', { code: 403 });
      }

      const recaptchaValid = await recaptcha.verify(recaptchaToken);
      if (!recaptchaValid) {
        return assistant.respond('Request could not be verified', { code: 403 });
      }
    }

    // Check rate limit via Usage API
    try {
      await usage.validate('marketing-subscribe', { useCaptchaResponse: false });
      usage.increment('marketing-subscribe');
      await usage.update();
    } catch (e) {
      return assistant.respond('Rate limit exceeded', { code: 429 });
    }
  }

  // Infer name if not provided
  let nameInferred = null;
  if (!firstName && !lastName) {
    nameInferred = await inferContact(email, assistant);
    firstName = nameInferred.firstName;
    lastName = nameInferred.lastName;
  }

  // Add to providers
  let providerResults = {};

  if (!shouldCallExternalAPIs) {
    assistant.log('marketing/contact: Skipping providers (BEM_TESTING=true, TEST_EXTENDED_MODE not set)');
  } else {
    const mailer = Manager.Email(assistant);
    providerResults = await mailer.add({
      email,
      firstName,
      lastName,
      source,
      providers,
    });
  }

  // Log result
  assistant.log('marketing/contact result:', {
    email,
    providers: providerResults,
    validation,
    nameInferred,
  });

  // Track analytics
  analytics.event('marketing/contact', { action: 'add' });

  // Return response based on auth level
  if (isAdmin) {
    return assistant.respond({
      success: true,
      providers: providerResults,
      validation,
      nameInferred,
    });
  }

  // Public: generic response
  return assistant.respond({ success: true });
};
