const path = require('path');
const recaptcha = require(path.join(__dirname, '..', '..', '..', '..', '..', 'libraries', 'recaptcha.js'));
const { validate: validateEmail } = require(path.join(__dirname, '..', '..', '..', '..', '..', 'libraries', 'email', 'validation.js'));
const { inferContact } = require(path.join(__dirname, '..', '..', '..', '..', '..', 'libraries', 'infer-contact.js'));

function Module() {}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const requestPayload = payload.data.payload || {};
    const { admin } = Manager.libraries;

    // Initialize Usage to check auth level
    const usage = await Manager.Usage().init(assistant, {
      unauthenticatedMode: 'firestore',
    });
    const isAdmin = usage.user.roles?.admin || payload.user?.roles?.admin;

    // Extract parameters
    const email = (requestPayload.email || '').trim().toLowerCase();
    let firstName = (requestPayload.firstName || '').trim();
    let lastName = (requestPayload.lastName || '').trim();
    const source = requestPayload.source || 'unknown';

    // Admin-only options
    const tags = isAdmin ? (requestPayload.tags || []) : [];
    const providers = isAdmin ? (requestPayload.providers || ['sendgrid', 'beehiiv']) : ['sendgrid', 'beehiiv'];
    const skipValidation = isAdmin ? (requestPayload.skipValidation || false) : false;

    // Validate email is provided
    if (!email) {
      return reject(assistant.errorify('Email is required', { code: 400 }));
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reject(assistant.errorify('Invalid email format', { code: 400 }));
    }

    // Public access protection
    if (!isAdmin) {
      // Verify reCAPTCHA (skip during automated tests)
      if (!assistant.isTesting()) {
        const recaptchaToken = requestPayload['g-recaptcha-response'];
        if (!recaptchaToken) {
          return reject(assistant.errorify('Request could not be verified', { code: 403 }));
        }

        const recaptchaValid = await recaptcha.verify(recaptchaToken);
        if (!recaptchaValid) {
          return reject(assistant.errorify('Request could not be verified', { code: 403 }));
        }
      }

      // Check rate limit via Usage API
      try {
        await usage.validate('marketing-subscribe', { useCaptchaResponse: false });
        usage.increment('marketing-subscribe');
        await usage.update();
      } catch (e) {
        return reject(assistant.errorify('Rate limit exceeded', { code: 429 }));
      }
    }

    // Skip external API calls in test mode unless TEST_EXTENDED_MODE is set
    const shouldCallExternalAPIs = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

    // Email validation
    let validation = { valid: true, checks: {} };

    if (!skipValidation) {
      validation = await validateEmail(email, {
        zerobounce: isAdmin && shouldCallExternalAPIs,
      });

      if (!validation.valid) {
        // For public requests, return generic success to prevent enumeration
        if (!isAdmin) {
          return resolve({ data: { success: true } });
        }

        const disposable = validation.checks.disposable;
        if (disposable && !disposable.valid) {
          return reject(assistant.errorify(`Disposable email domain not allowed: ${disposable.domain}`, { code: 400 }));
        }

        return reject(assistant.errorify('Email validation failed', { code: 400 }));
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
      assistant.log('add-marketing-contact: Skipping providers (BEM_TESTING=true, TEST_EXTENDED_MODE not set)');
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
    assistant.log('add-marketing-contact result:', {
      email,
      providers: providerResults,
      validation,
      nameInferred,
    });

    // Return response based on auth level
    if (isAdmin) {
      return resolve({
        data: {
          success: true,
          providers: providerResults,
          validation,
          nameInferred,
        },
      });
    }

    // Public: generic response
    return resolve({
      data: {
        success: true,
      },
    });
  });
};

module.exports = Module;
