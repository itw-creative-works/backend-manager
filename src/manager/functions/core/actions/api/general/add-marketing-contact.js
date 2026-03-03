const fetch = require('wonderful-fetch');
const path = require('path');
const dns = require('dns').promises;

// Load disposable domains list
const DISPOSABLE_DOMAINS = require(path.join(__dirname, '..', '..', '..', '..', '..', 'libraries', 'disposable-domains.json'));
const DISPOSABLE_SET = new Set(DISPOSABLE_DOMAINS.map(d => d.toLowerCase()));
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
      // Verify reCAPTCHA
      const recaptchaToken = requestPayload['g-recaptcha-response'];
      if (!recaptchaToken) {
        return reject(assistant.errorify('reCAPTCHA token required', { code: 400 }));
      }

      const recaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!recaptchaValid) {
        return reject(assistant.errorify('reCAPTCHA verification failed', { code: 400 }));
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

    // Email validation
    const validation = { valid: true, checks: {} };

    // Skip external API calls in test mode unless TEST_EXTENDED_MODE is set
    const shouldCallExternalAPIs = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

    if (!skipValidation) {
      // Check disposable domain
      const domain = email.split('@')[1];
      if (DISPOSABLE_SET.has(domain.toLowerCase())) {
        validation.valid = false;
        validation.checks.disposable = { blocked: true, domain };

        // For public requests, return generic success to prevent enumeration
        if (!isAdmin) {
          return resolve({ data: { success: true } });
        }
        return reject(assistant.errorify(`Disposable email domain not allowed: ${domain}`, { code: 400 }));
      }
      validation.checks.disposable = { blocked: false };

      // MX record check (optional, skip for speed in most cases)
      // const hasMx = await checkMxRecord(domain);
      // validation.checks.mx = { valid: hasMx };

      // ZeroBounce validation (admin only, if key exists, and not in test mode unless TEST_EXTENDED_MODE)
      if (isAdmin && process.env.ZEROBOUNCE_API_KEY && shouldCallExternalAPIs) {
        const zbResult = await validateWithZeroBounce(email);
        validation.checks.zerobounce = zbResult;
        if (!zbResult.valid) {
          validation.valid = false;
        }
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
    const providerResults = {};

    if (!shouldCallExternalAPIs) {
      assistant.log('add-marketing-contact: Skipping providers (BEM_TESTING=true, TEST_EXTENDED_MODE not set)');
    } else {
      assistant.log('add-marketing-contact: Adding contact to providers:', { providers });

      // SendGrid Marketing Contacts
      if (providers.includes('sendgrid') && process.env.SENDGRID_API_KEY) {
        providerResults.sendgrid = await addToSendGrid({
          email,
          firstName,
          lastName,
          source,
          appId: Manager.config.app.id,
          brandName: Manager.config.brand?.name,
        });
      }

      // Beehiiv
      if (providers.includes('beehiiv') && process.env.BEEHIIV_API_KEY) {
        providerResults.beehiiv = await addToBeehiiv({
          email,
          firstName,
          lastName,
          source,
          brandName: Manager.config.brand?.name,
        });
      }
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

/**
 * Verify Google reCAPTCHA (invisible) token
 */
async function verifyRecaptcha(token) {
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    // Skip verification if no secret configured
    return true;
  }

  try {
    // reCAPTCHA requires form-urlencoded, not JSON
    const data = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      response: 'json',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    // For v3 invisible reCAPTCHA, check score (0.5+ is typically human)
    return data.success && (data.score === undefined || data.score >= 0.5);
  } catch (e) {
    console.error('reCAPTCHA verification error:', e);
    return false;
  }
}

/**
 * Validate email with ZeroBounce API
 */
async function validateWithZeroBounce(email) {
  try {
    const data = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${process.env.ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      {
        response: 'json',
        timeout: 10000,
      }
    );

    // ZeroBounce returns error in response body (e.g., invalid API key, out of credits)
    if (data.error) {
      console.error('ZeroBounce API error:', data.error);
      return { valid: true, error: data.error }; // Fail open
    }

    // Ensure status exists (defensive check)
    if (!data.status) {
      console.error('ZeroBounce unexpected response:', data);
      return { valid: true, error: 'Unexpected response format' };
    }

    return {
      valid: data.status === 'valid',
      status: data.status,
      subStatus: data.sub_status || null,
    };
  } catch (e) {
    console.error('ZeroBounce validation error:', e);
    return { valid: true, error: e.message }; // Fail open
  }
}

/**
 * Check if domain has valid MX records
 */
async function checkMxRecord(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Add contact to SendGrid Marketing Contacts
 */
async function addToSendGrid({ email, firstName, lastName, source, appId, brandName }) {
  try {
    // Get list ID matched by brand name
    const listId = await getSendGridListId(brandName);

    const requestBody = {
      contacts: [
        {
          email,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          custom_fields: {
            e1_T: source, // Assumes custom field exists for source
            e2_T: appId,  // Assumes custom field exists for app_id
          },
        },
      ],
    };

    // Add to specific list if matched
    if (listId) {
      requestBody.list_ids = [listId];
    }

    const data = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
      method: 'put',
      response: 'json',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      timeout: 15000,
      body: requestBody,
    });

    if (data.job_id) {
      return { success: true, jobId: data.job_id, listId };
    }

    return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
  } catch (e) {
    console.error('SendGrid error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get SendGrid list ID by matching brand name (with pagination)
 */
async function getSendGridListId(brandName) {
  const brandNameLower = (brandName || '').toLowerCase();
  const allLists = [];
  let pageToken = '';
  const pageSize = 1000;

  try {
    // Paginate through all lists
    while (true) {
      const url = `https://api.sendgrid.com/v3/marketing/lists?page_size=${pageSize}${pageToken ? `&page_token=${pageToken}` : ''}`;
      const data = await fetch(url, {
        response: 'json',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        },
        timeout: 10000,
      });

      if (!data.result || data.result.length === 0) {
        break;
      }

      // Check for match in this page
      const matchedList = data.result.find(list =>
        list.name.toLowerCase() === brandNameLower
        || list.name.toLowerCase().includes(brandNameLower)
        || brandNameLower.includes(list.name.toLowerCase())
      );

      if (matchedList) {
        return matchedList.id;
      }

      allLists.push(...data.result);

      // Check for next page token in metadata
      if (!data._metadata?.next) {
        break;
      }

      // Extract page_token from next URL
      const nextUrl = new URL(data._metadata.next);
      pageToken = nextUrl.searchParams.get('page_token');

      if (!pageToken) {
        break;
      }
    }

    // Fallback to first list if only one exists total
    if (allLists.length === 1) {
      return allLists[0].id;
    }

    if (allLists.length > 0) {
      console.error(`SendGrid: No list matched brand "${brandName}". Available: ${allLists.map(l => l.name).join(', ')}`);
    }
  } catch (e) {
    console.error('SendGrid list lookup error:', e);
  }

  return null;
}

/**
 * Add contact to Beehiiv newsletter
 */
async function addToBeehiiv({ email, firstName, lastName, source, brandName }) {
  try {
    // Get publication ID (cached, matched by brand name)
    const pubId = await getBeehiivPublicationId(brandName);
    if (!pubId) {
      return { success: false, error: 'Could not find matching publication' };
    }

    const data = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'post',
      response: 'json',
      headers: {
        'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
      },
      timeout: 15000,
      body: {
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: source,
        custom_fields: [
          firstName ? { name: 'first_name', value: firstName } : null,
          lastName ? { name: 'last_name', value: lastName } : null,
        ].filter(Boolean),
      },
    });

    if (data.data?.id) {
      return { success: true, id: data.data.id };
    }

    return { success: false, error: data.message || 'Unknown error' };
  } catch (e) {
    console.error('Beehiiv error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get Beehiiv publication ID by matching brand name (with pagination)
 * Brand name is REQUIRED - no fallback to random publications
 * @param {string} brandName - Brand name to match (required)
 */
async function getBeehiivPublicationId(brandName) {
  // Brand name is required
  if (!brandName) {
    console.error('Beehiiv: Brand name is required to find publication');
    return null;
  }

  const brandNameLower = brandName.toLowerCase();
  const allPublications = [];
  let page = 1;
  const limit = 100;

  try {
    // Paginate through all publications
    while (true) {
      const data = await fetch(`https://api.beehiiv.com/v2/publications?limit=${limit}&page=${page}`, {
        response: 'json',
        headers: {
          'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
        timeout: 10000,
      });

      if (!data.data || data.data.length === 0) {
        break;
      }

      // Check for match in this page
      const matchedPub = data.data.find(pub =>
        pub.name.toLowerCase() === brandNameLower
        || pub.name.toLowerCase().includes(brandNameLower)
        || brandNameLower.includes(pub.name.toLowerCase())
      );

      if (matchedPub) {
        return matchedPub.id;
      }

      allPublications.push(...data.data);

      // If we got fewer than limit, we've reached the end
      if (data.data.length < limit) {
        break;
      }

      page++;
    }

    // No fallback - brand must match
    console.error(`Beehiiv: No publication matched brand "${brandName}". Available: ${allPublications.map(p => p.name).join(', ')}`);
  } catch (e) {
    console.error('Beehiiv publication lookup error:', e);
  }

  return null;
}

module.exports = Module;
