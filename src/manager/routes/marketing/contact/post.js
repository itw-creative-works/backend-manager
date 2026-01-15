/**
 * POST /marketing/contact - Add marketing contact
 * Public endpoint to subscribe to newsletter, with admin options
 */
const fetch = require('wonderful-fetch');
const path = require('path');
const dns = require('dns').promises;

// Load disposable domains list
const DISPOSABLE_DOMAINS = require(path.join(__dirname, '..', '..', '..', 'libraries', 'disposable-domains.json'));
const DISPOSABLE_SET = new Set(DISPOSABLE_DOMAINS.map(d => d.toLowerCase()));

// Load OpenAI library
const OpenAI = require(path.join(__dirname, '..', '..', '..', 'libraries', 'openai'));

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Initialize Usage to check auth level
  const usage = await Manager.Usage().init(assistant, {
    unauthenticatedMode: 'firestore',
  });
  const isAdmin = usage.user.roles?.admin;

  // Extract parameters
  const email = (settings.email || '').trim().toLowerCase();
  let firstName = (settings.firstName || '').trim();
  let lastName = (settings.lastName || '').trim();
  const source = settings.source || 'unknown';

  // Admin-only options
  const tags = isAdmin ? (settings.tags || []) : [];
  const providers = isAdmin ? (settings.providers || ['sendgrid', 'beehiiv']) : ['sendgrid', 'beehiiv'];
  const skipValidation = isAdmin ? (settings.skipValidation || false) : false;

  // Validate email is provided
  if (!email) {
    return assistant.respond('Email is required', { code: 400 });
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return assistant.respond('Invalid email format', { code: 400 });
  }

  // Public access protection
  if (!isAdmin) {
    // Verify reCAPTCHA
    const recaptchaToken = settings['g-recaptcha-response'];
    if (!recaptchaToken) {
      return assistant.respond('reCAPTCHA token required', { code: 400 });
    }

    const recaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaValid) {
      return assistant.respond('reCAPTCHA verification failed', { code: 400 });
    }

    // Check rate limit via Usage API
    try {
      await usage.validate('marketing-subscribe', { throw: true, useCaptchaResponse: false });
      usage.increment('marketing-subscribe');
      await usage.update();
    } catch (e) {
      return assistant.respond('Rate limit exceeded', { code: 429 });
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
        return assistant.respond({ success: true });
      }
      return assistant.respond(`Disposable email domain not allowed: ${domain}`, { code: 400 });
    }
    validation.checks.disposable = { blocked: false };

    // ZeroBounce validation (admin only, if key exists)
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
    nameInferred = await inferName(email, assistant);
    firstName = nameInferred.firstName;
    lastName = nameInferred.lastName;
  }

  // Add to providers
  const providerResults = {};

  if (!shouldCallExternalAPIs) {
    assistant.log('marketing/contact: Skipping providers (BEM_TESTING=true, TEST_EXTENDED_MODE not set)');
  } else {
    assistant.log('marketing/contact: Adding contact to providers:', { providers });

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
  assistant.log('marketing/contact result:', {
    email,
    providers: providerResults,
    validation,
    nameInferred,
  });

  // Track analytics
  assistant.analytics.event('marketing/contact', { action: 'add' });

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

// Helper: Verify Google reCAPTCHA token
async function verifyRecaptcha(token) {
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    return true;
  }

  try {
    const data = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      response: 'json',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    return data.success && (data.score === undefined || data.score >= 0.5);
  } catch (e) {
    console.error('reCAPTCHA verification error:', e);
    return false;
  }
}

// Helper: Validate email with ZeroBounce API
async function validateWithZeroBounce(email) {
  try {
    const data = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${process.env.ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      { response: 'json', timeout: 10000 }
    );

    if (data.error) {
      console.error('ZeroBounce API error:', data.error);
      return { valid: true, error: data.error };
    }

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
    return { valid: true, error: e.message };
  }
}

// Helper: Infer name from email
async function inferName(email, assistant) {
  if (process.env.OPENAI_API_KEY) {
    const aiResult = await inferNameWithAI(email, assistant);
    if (aiResult && (aiResult.firstName || aiResult.lastName)) {
      return aiResult;
    }
  }

  return inferNameFromEmail(email);
}

// Helper: Use AI to infer name
async function inferNameWithAI(email, assistant) {
  try {
    const ai = new OpenAI(assistant);
    const result = await ai.request({
      model: 'gpt-5-mini',
      timeout: 30000,
      maxTokens: 1024,
      moderate: false,
      response: 'json',
      prompt: {
        content: `
          <identity>
            You extract names and company from email addresses.
          </identity>

          <format>
            Return ONLY valid JSON like so:
            {
              "firstName": "...",
              "lastName": "...",
              "company": "...",
              "confidence": "..."
            }

            If you cannot determine a name, use empty strings.
          </format>
        `,
      },
      message: {
        content: `Email: ${email}`,
      },
    });

    if (result?.firstName !== undefined) {
      return {
        firstName: capitalize(result.firstName || ''),
        lastName: capitalize(result.lastName || ''),
        company: capitalize(result.company || ''),
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
        method: 'ai',
      };
    }
  } catch (e) {
    console.error('AI name inference error:', e);
  }

  return null;
}

// Helper: Regex-based name inference
function inferNameFromEmail(email) {
  const local = email.split('@')[0];
  const cleaned = local.replace(/[0-9]+$/, '');
  const parts = cleaned.split(/[._-]/);

  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: capitalize(parts.slice(1).join(' ')),
      confidence: 0.5,
      method: 'regex',
    };
  }

  return {
    firstName: capitalize(cleaned),
    lastName: '',
    confidence: 0.25,
    method: 'regex',
  };
}

// Helper: Capitalize string
function capitalize(str) {
  if (!str) {
    return '';
  }
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper: Add contact to SendGrid
async function addToSendGrid({ email, firstName, lastName, source, appId, brandName }) {
  try {
    const listId = await getSendGridListId(brandName);

    const requestBody = {
      contacts: [
        {
          email,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          custom_fields: {
            e1_T: source,
            e2_T: appId,
          },
        },
      ],
    };

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

// Helper: Get SendGrid list ID by brand name
async function getSendGridListId(brandName) {
  const brandNameLower = (brandName || '').toLowerCase();
  const allLists = [];
  let pageToken = '';
  const pageSize = 1000;

  try {
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

      const matchedList = data.result.find(list =>
        list.name.toLowerCase() === brandNameLower
        || list.name.toLowerCase().includes(brandNameLower)
        || brandNameLower.includes(list.name.toLowerCase())
      );

      if (matchedList) {
        return matchedList.id;
      }

      allLists.push(...data.result);

      if (!data._metadata?.next) {
        break;
      }

      const nextUrl = new URL(data._metadata.next);
      pageToken = nextUrl.searchParams.get('page_token');

      if (!pageToken) {
        break;
      }
    }

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

// Helper: Add contact to Beehiiv
async function addToBeehiiv({ email, firstName, lastName, source, brandName }) {
  try {
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

// Helper: Get Beehiiv publication ID by brand name
async function getBeehiivPublicationId(brandName) {
  if (!brandName) {
    console.error('Beehiiv: Brand name is required to find publication');
    return null;
  }

  const brandNameLower = brandName.toLowerCase();
  const allPublications = [];
  let page = 1;
  const limit = 100;

  try {
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

      const matchedPub = data.data.find(pub =>
        pub.name.toLowerCase() === brandNameLower
        || pub.name.toLowerCase().includes(brandNameLower)
        || brandNameLower.includes(pub.name.toLowerCase())
      );

      if (matchedPub) {
        return matchedPub.id;
      }

      allPublications.push(...data.data);

      if (data.data.length < limit) {
        break;
      }

      page++;
    }

    console.error(`Beehiiv: No publication matched brand "${brandName}". Available: ${allPublications.map(p => p.name).join(', ')}`);
  } catch (e) {
    console.error('Beehiiv publication lookup error:', e);
  }

  return null;
}
