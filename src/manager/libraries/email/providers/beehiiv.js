/**
 * Beehiiv provider — shared API helpers for subscriber management
 *
 * Used by: marketing/index.js (sync, remove)
 */
const fetch = require('wonderful-fetch');
const Manager = require('../../../index.js');
const { FIELDS, resolveFieldValues } = require('../constants.js');

const BASE_URL = 'https://api.beehiiv.com/v2';

// --- Internal helpers ---

function headers() {
  return {
    'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
  };
}

// --- Subscriber Management ---

/**
 * Add or reactivate a subscriber to a Beehiiv publication.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {string} [options.source] - UTM source
 * @param {string} options.publicationId
 * @param {Array<{name: string, value: string}>} [options.customFields] - Additional custom fields
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
async function addSubscriber({ email, firstName, lastName, source, publicationId, customFields }) {
  try {
    const body = {
      email,
      reactivate_existing: true,
      send_welcome_email: true,
    };

    if (source) {
      body.utm_source = source;
    }

    // Build custom fields array
    const fields = [
      ...(customFields || []),
    ];

    if (firstName) {
      fields.push({ name: 'first_name', value: firstName });
    }
    if (lastName) {
      fields.push({ name: 'last_name', value: lastName });
    }

    if (fields.length) {
      body.custom_fields = fields;
    }

    const data = await fetch(`${BASE_URL}/publications/${publicationId}/subscriptions`, {
      method: 'post',
      response: 'json',
      headers: headers(),
      timeout: 15000,
      body,
    });

    if (data.data?.id) {
      return { success: true, id: data.data.id };
    }

    return { success: false, error: data.message || 'Unknown error' };
  } catch (e) {
    console.error('Beehiiv addSubscriber error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Remove a subscriber from a Beehiiv publication by email.
 *
 * @param {string} email
 * @param {string} publicationId
 * @returns {{ success: boolean, deleted?: boolean, skipped?: boolean, error?: string }}
 */
async function removeSubscriber(email, publicationId) {
  try {
    const encodedEmail = encodeURIComponent(email);

    // Step 1: Get subscription by email
    let searchData;
    try {
      searchData = await fetch(
        `${BASE_URL}/publications/${publicationId}/subscriptions/by_email/${encodedEmail}`,
        {
          response: 'json',
          headers: headers(),
          timeout: 10000,
        }
      );
    } catch (e) {
      if (e.status === 404) {
        return { success: true, skipped: true, reason: 'Subscriber not found' };
      }
      throw e;
    }

    if (!searchData.data?.id) {
      return { success: true, skipped: true, reason: 'Subscription not found' };
    }

    const subscriptionId = searchData.data.id;

    // Step 2: Permanently delete the subscription
    await fetch(
      `${BASE_URL}/publications/${publicationId}/subscriptions/${subscriptionId}`,
      {
        method: 'delete',
        headers: headers(),
        timeout: 10000,
      }
    );

    return { success: true, deleted: true, subscriptionId };
  } catch (e) {
    console.error('Beehiiv removeSubscriber error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get a Beehiiv publication ID by brand name (fuzzy match).
 *
 * @param {string} brandName
 * @returns {string|null} Publication ID or null
 */
let _publicationIdCache = null;

async function getPublicationId() {
  if (_publicationIdCache) {
    return _publicationIdCache;
  }

  // Use publicationId from config if set (skips API call)
  const configPubId = Manager.config?.marketing?.beehiiv?.publicationId;

  if (configPubId) {
    _publicationIdCache = configPubId;
    return configPubId;
  }

  // Fuzzy-match by brand name
  const brandName = Manager.config.brand?.name;

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
      const data = await fetch(`${BASE_URL}/publications?limit=${limit}&page=${page}`, {
        response: 'json',
        headers: headers(),
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
        _publicationIdCache = matchedPub.id;
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

/**
 * Add a contact to Beehiiv — resolves publication, adds subscriber with optional custom fields.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {string} [options.source] - UTM source
 * @param {Array<{name: string, value: string}>} [options.customFields] - Pre-built custom fields
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
async function addContact({ email, firstName, lastName, company, source, customFields }) {
  const publicationId = await getPublicationId();

  if (!publicationId) {
    return { success: false, error: 'Publication not found' };
  }

  const fields = [...(customFields || [])];
  if (company) {
    fields.push({ name: 'company', value: company });
  }

  return addSubscriber({
    email,
    firstName,
    lastName,
    source,
    publicationId,
    customFields: fields,
  });
}

/**
 * Remove a contact from Beehiiv — resolves publication from config.
 *
 * @param {string} email
 * @returns {{ success: boolean, deleted?: boolean, skipped?: boolean, error?: string }}
 */
async function removeContact(email) {
  const publicationId = await getPublicationId();

  if (!publicationId) {
    return { success: false, error: 'Publication not found' };
  }

  return removeSubscriber(email, publicationId);
}

/**
 * Build Beehiiv custom_fields array from a user doc.
 * Resolves all field values, then maps to display names for Beehiiv.
 * Beehiiv matches custom fields by their display name.
 *
 * @param {object} userDoc - User document from Firestore
 * @returns {Array<{name: string, value: string}>} Custom fields in Beehiiv format
 */
function buildFields(userDoc) {
  const values = resolveFieldValues(userDoc, Manager.config);
  const fields = [];

  for (const [name, value] of Object.entries(values)) {
    const fieldConfig = FIELDS[name];
    const displayName = fieldConfig?.display || name;
    fields.push({ name: displayName, value: String(value) });
  }

  return fields;
}

// --- Campaigns (Posts) ---

/**
 * Create a Beehiiv post (their equivalent of a campaign/newsletter).
 *
 * @param {object} options
 * @param {string} options.title - Post title (required)
 * @param {string} [options.subject] - Email subject line (defaults to title)
 * @param {string} [options.preheader] - Email preview text
 * @param {string} [options.content] - HTML content body
 * @param {string} [options.status] - 'draft' or 'confirmed' (default: confirmed = send)
 * @param {string} [options.sendAt] - ISO datetime to schedule, or null for immediate
 * @param {Array<string>} [options.segments] - Segment IDs to include
 * @param {Array<string>} [options.excludeSegments] - Segment IDs to exclude
 * @returns {{ success: boolean, id?: string, scheduled?: boolean, error?: string }}
 */
async function createPost(options) {
  const publicationId = await getPublicationId();

  if (!publicationId) {
    return { success: false, error: 'Publication not found' };
  }

  const { title, subject, preheader, content, status, sendAt, segments, excludeSegments } = options;

  try {
    const body = {
      title,
      status: sendAt ? 'confirmed' : (status || 'confirmed'),
    };

    // Content
    if (content) {
      body.body_content = content;
    }

    // Scheduling
    if (sendAt && sendAt !== 'now') {
      body.scheduled_at = new Date(sendAt).toISOString();
    }

    // Email settings
    const emailSettings = {};

    if (subject) {
      emailSettings.subject_line = subject;
    }
    if (preheader) {
      emailSettings.preview_text = preheader;
    }

    if (Object.keys(emailSettings).length) {
      body.email_settings = emailSettings;
    }

    // Audience targeting (segments)
    if ((segments && segments.length) || (excludeSegments && excludeSegments.length)) {
      body.recipients = {};

      if (segments && segments.length) {
        body.recipients.segment_ids = segments;
      }
      if (excludeSegments && excludeSegments.length) {
        body.recipients.exclude_segment_ids = excludeSegments;
      }
    }

    const data = await fetch(`${BASE_URL}/publications/${publicationId}/posts`, {
      method: 'post',
      response: 'json',
      headers: headers(),
      timeout: 15000,
      body,
    });

    if (data.data?.id) {
      const scheduled = !!sendAt;
      return { success: true, id: data.data.id, scheduled };
    }

    return { success: false, error: data.message || 'Unknown error' };
  } catch (e) {
    console.error('Beehiiv createPost error:', e);
    return { success: false, error: e.message };
  }
}

module.exports = {
  // Contacts
  addContact,
  removeContact,
  buildFields,

  // Campaigns
  createPost,
};
