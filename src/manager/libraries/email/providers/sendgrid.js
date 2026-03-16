/**
 * SendGrid provider — shared API helpers for contacts and Single Sends
 *
 * Used by: marketing/index.js (sync, remove, campaigns)
 */
const fetch = require('wonderful-fetch');
const Manager = require('../../../index.js');
const { resolveFieldValues } = require('../constants.js');

const BASE_URL = 'https://api.sendgrid.com/v3';

// --- Internal helpers ---

function headers() {
  return {
    'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
  };
}

// Cached field name → SendGrid ID map (e.g., { brand_id: 'e1_T', user_auth_uid: 'e2_T' })
let _fieldIdCache = null;

/**
 * Fetch custom field definitions from SendGrid and build a name → id map.
 * Cached in memory for the lifetime of the process.
 *
 * @returns {object} Map of field name → SendGrid field ID
 */
async function resolveFieldIds() {
  if (_fieldIdCache) {
    return _fieldIdCache;
  }

  try {
    const data = await fetch(`${BASE_URL}/marketing/field_definitions`, {
      response: 'json',
      headers: headers(),
      timeout: 10000,
    });

    _fieldIdCache = {};

    for (const field of (data.custom_fields || [])) {
      _fieldIdCache[field.name] = field.id;
    }

    return _fieldIdCache;
  } catch (e) {
    console.error('SendGrid resolveFieldIds error:', e);
    return {};
  }
}

// --- Contact Management ---

/**
 * Upsert contacts to SendGrid Marketing Contacts.
 * Creates if new, merges/overwrites fields if existing.
 *
 * @param {object} options
 * @param {Array<object>} options.contacts - Array of contact objects ({ email, first_name, last_name, custom_fields })
 * @param {Array<string>} [options.listIds] - List IDs to add contacts to
 * @returns {{ success: boolean, jobId?: string, error?: string }}
 */
async function upsertContacts({ contacts, listIds }) {
  try {
    const body = { contacts };

    if (listIds && listIds.length) {
      body.list_ids = listIds;
    }

    const data = await fetch(`${BASE_URL}/marketing/contacts`, {
      method: 'put',
      response: 'json',
      headers: headers(),
      timeout: 15000,
      body,
    });

    if (data.job_id) {
      return { success: true, jobId: data.job_id };
    }

    return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
  } catch (e) {
    console.error('SendGrid upsertContacts error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Remove a contact from SendGrid by email address.
 *
 * @param {string} email
 * @returns {{ success: boolean, jobId?: string, skipped?: boolean, error?: string }}
 */
async function removeContact(email) {
  try {
    // Step 1: Get contact ID by email
    const searchData = await fetch(`${BASE_URL}/marketing/contacts/search/emails`, {
      method: 'post',
      response: 'json',
      headers: headers(),
      timeout: 10000,
      body: { emails: [email] },
    });

    if (!searchData.result?.[email]?.contact?.id) {
      return { success: true, skipped: true, reason: 'Contact not found' };
    }

    const contactId = searchData.result[email].contact.id;

    // Step 2: Delete contact by ID
    const deleteData = await fetch(`${BASE_URL}/marketing/contacts?ids=${contactId}`, {
      method: 'delete',
      response: 'json',
      headers: headers(),
      timeout: 10000,
    });

    if (deleteData.job_id) {
      return { success: true, jobId: deleteData.job_id };
    }

    return { success: false, error: deleteData.errors?.[0]?.message || 'Delete failed' };
  } catch (e) {
    console.error('SendGrid removeContact error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get a SendGrid list ID by brand name (fuzzy match).
 *
 * @param {string} brandName
 * @returns {string|null} List ID or null
 */
async function getListId() {
  const brandName = Manager.config.brand?.name;
  const brandNameLower = (brandName || '').toLowerCase();
  const allLists = [];
  let pageToken = '';
  const pageSize = 1000;

  try {
    while (true) {
      const url = `${BASE_URL}/marketing/lists?page_size=${pageSize}${pageToken ? `&page_token=${pageToken}` : ''}`;
      const data = await fetch(url, {
        response: 'json',
        headers: headers(),
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

// --- Single Sends (Campaigns) ---

/**
 * Create a Single Send (marketing campaign).
 *
 * @param {object} options
 * @param {string} options.name - Campaign name
 * @param {string} options.subject - Email subject
 * @param {string} options.templateId - SendGrid template ID
 * @param {object} options.from - { email, name }
 * @param {object} options.sendTo - { list_ids?, segment_ids?, all? }
 * @param {number} [options.asmGroupId] - Unsubscribe group ID
 * @param {Array<string>} [options.categories] - Email categories
 * @param {object} [options.dynamicTemplateData] - Template variables
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
async function createSingleSend({ name, subject, templateId, from, sendTo, asmGroupId, categories, dynamicTemplateData }) {
  try {
    const body = {
      name,
      send_to: sendTo,
      email_config: {
        subject,
        sender_id: null,
        custom_unsubscribe_url: null,
        generate_plain_content: true,
      },
    };

    // Use design_editor with template
    if (templateId) {
      body.email_config.editor = 'design';
      body.email_config.template_id = templateId;
    }

    if (from) {
      body.email_config.sender_id = null;
      // SendGrid Single Sends use sender_id OR from, depending on account setup.
      // We'll set the from fields directly if supported, otherwise the sender_id
      // must be pre-configured in SendGrid.
    }

    if (asmGroupId) {
      body.email_config.suppression_group_id = asmGroupId;
    }

    if (categories && categories.length) {
      body.email_config.categories = categories;
    }

    const data = await fetch(`${BASE_URL}/marketing/singlesends`, {
      method: 'post',
      response: 'json',
      headers: headers(),
      timeout: 15000,
      body,
    });

    if (data.id) {
      return { success: true, id: data.id };
    }

    return { success: false, error: data.errors?.[0]?.message || 'Unknown error' };
  } catch (e) {
    console.error('SendGrid createSingleSend error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Schedule a Single Send for delivery.
 *
 * @param {string} singleSendId - The Single Send ID
 * @param {string} sendAt - ISO 8601 datetime string (e.g., '2026-04-01T14:00:00Z'), or 'now'
 * @returns {{ success: boolean, error?: string }}
 */
async function scheduleSingleSend(singleSendId, sendAt) {
  try {
    const data = await fetch(`${BASE_URL}/marketing/singlesends/${singleSendId}/schedule`, {
      method: 'put',
      response: 'json',
      headers: headers(),
      timeout: 15000,
      body: { send_at: sendAt },
    });

    if (data.send_at || data.status === 'scheduled') {
      return { success: true };
    }

    return { success: false, error: data.errors?.[0]?.message || 'Schedule failed' };
  } catch (e) {
    console.error('SendGrid scheduleSingleSend error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Cancel a scheduled Single Send.
 *
 * @param {string} singleSendId
 * @returns {{ success: boolean, error?: string }}
 */
async function cancelSingleSend(singleSendId) {
  try {
    const data = await fetch(`${BASE_URL}/marketing/singlesends/${singleSendId}`, {
      method: 'delete',
      response: 'json',
      headers: headers(),
      timeout: 10000,
    });

    return { success: true };
  } catch (e) {
    console.error('SendGrid cancelSingleSend error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get a Single Send by ID.
 *
 * @param {string} singleSendId
 * @returns {object|null}
 */
async function getSingleSend(singleSendId) {
  try {
    const data = await fetch(`${BASE_URL}/marketing/singlesends/${singleSendId}`, {
      response: 'json',
      headers: headers(),
      timeout: 10000,
    });

    return data.id ? data : null;
  } catch (e) {
    console.error('SendGrid getSingleSend error:', e);
    return null;
  }
}

/**
 * List Single Sends with optional status filter.
 *
 * @param {object} [options]
 * @param {string} [options.status] - Filter by status: draft, scheduled, triggered
 * @returns {Array<object>}
 */
async function listSingleSends(options) {
  const { status } = options || {};

  try {
    const url = `${BASE_URL}/marketing/singlesends${status ? `?status=${status}` : ''}`;
    const data = await fetch(url, {
      response: 'json',
      headers: headers(),
      timeout: 10000,
    });

    return data.result || [];
  } catch (e) {
    console.error('SendGrid listSingleSends error:', e);
    return [];
  }
}

/**
 * Add a contact to SendGrid — resolves list, upserts with optional custom fields.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {object} [options.customFields] - Pre-built custom_fields object (keyed by SendGrid field IDs)
 * @returns {{ success: boolean, jobId?: string, listId?: string, error?: string }}
 */
async function addContact({ email, firstName, lastName, customFields }) {
  const contact = {
    email: email.toLowerCase(),
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    custom_fields: customFields || {},
  };

  const listId = await getListId();
  const result = await upsertContacts({
    contacts: [contact],
    listIds: listId ? [listId] : [],
  });

  if (result.success && listId) {
    result.listId = listId;
  }

  return result;
}

/**
 * Build SendGrid custom_fields object from a user doc.
 * Resolves all field values, then maps field names to SendGrid IDs via runtime lookup.
 *
 * @param {object} userDoc - User document from Firestore
 * @returns {object} Custom fields keyed by SendGrid field ID (e.g., { e1_T: 'basic' })
 */
async function buildFields(userDoc) {
  const values = resolveFieldValues(userDoc, Manager.config);
  const idMap = await resolveFieldIds();
  const fields = {};

  for (const [name, value] of Object.entries(values)) {
    const sgId = idMap[name];

    if (sgId) {
      fields[sgId] = value;
    }
  }

  return fields;
}

module.exports = {
  // Contacts
  addContact,
  removeContact,
  buildFields,

  // Campaigns (Single Sends)
  createSingleSend,
  scheduleSingleSend,
  cancelSingleSend,
  getSingleSend,
  listSingleSends,
};
