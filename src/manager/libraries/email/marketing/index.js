/**
 * Marketing email library — contact syncing + campaign management
 *
 * Usage:
 *   const email = Manager.Email(assistant);
 *
 *   // Add a new contact (newsletter subscribe, lightweight)
 *   await email.add({ email, firstName, lastName, source });
 *
 *   // Sync a user's full data to SendGrid/Beehiiv (all custom fields)
 *   await email.sync(userDoc);
 *
 *   // Remove a contact from all providers
 *   await email.remove('user@example.com');
 *
 *   // Send a marketing campaign (Single Send)
 *   await email.send({ type: 'marketing', name, subject, segments, ... });
 *
 * Used by:
 * - routes/marketing/contact (add)
 * - Auth on-create handler (sync on signup)
 * - Payment transition handlers (sync on subscription change)
 * - Auth on-delete handler (remove contact)
 * - Campaign cron jobs (send campaigns)
 */
const _ = require('lodash');

const { TEMPLATES, GROUPS, SENDERS, DEFAULT_PROVIDERS } = require('../constants.js');
const sendgridProvider = require('../providers/sendgrid.js');
const beehiivProvider = require('../providers/beehiiv.js');

function Marketing(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.admin = self.Manager.libraries.admin;

  return self;
}

/**
 * Add a new contact to all providers (lightweight — no full user doc needed).
 * Used by newsletter subscribe and admin bulk import.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {string} [options.source] - UTM source
 * @param {object} [options.customFields] - Extra SendGrid custom fields (keyed by field ID)
 * @param {Array<string>} [options.providers] - Which providers (default: all available)
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.add = async function (options) {
  const self = this;
  const assistant = self.assistant;
  const { email, firstName, lastName, source, customFields, providers } = options;

  if (!email) {
    assistant.warn('Marketing.add(): No email provided, skipping');
    return {};
  }

  const shouldAdd = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;
  const addProviders = providers || DEFAULT_PROVIDERS;
  const results = {};

  if (!shouldAdd) {
    assistant.log('Marketing.add(): Skipping providers (testing mode)');
    return results;
  }

  assistant.log('Marketing.add():', { email });

  const promises = [];

  if (addProviders.includes('sendgrid') && process.env.SENDGRID_API_KEY) {
    promises.push(
      sendgridProvider.addContact({
        email,
        firstName,
        lastName,
        customFields,
      }).then((r) => { results.sendgrid = r; })
    );
  }

  if (addProviders.includes('beehiiv') && process.env.BEEHIIV_API_KEY) {
    promises.push(
      beehiivProvider.addContact({
        email,
        firstName,
        lastName,
        source,
      }).then((r) => { results.beehiiv = r; })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.add() result:', results);

  return results;
};

/**
 * Sync a user's data to SendGrid and Beehiiv.
 * Upserts the contact with all custom fields derived from the user doc.
 *
 * @param {string|object} userDocOrUid - UID string (fetches from Firestore) or full user document object
 * @param {object} [options]
 * @param {Array<string>} [options.providers] - Which providers to sync to (default: all available)
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.sync = async function (userDocOrUid, options) {
  const self = this;
  const assistant = self.assistant;
  const { providers } = options || {};

  // Resolve UID to user doc if string
  let userDoc;

  if (typeof userDocOrUid === 'string') {
    const snap = await self.admin.firestore().doc(`users/${userDocOrUid}`).get()
      .catch((e) => {
        assistant.error('Marketing.sync(): Failed to fetch user doc:', e);
        return null;
      });

    if (!snap || !snap.exists) {
      assistant.warn(`Marketing.sync(): User ${userDocOrUid} not found, skipping`);
      return {};
    }

    userDoc = snap.data();
  } else {
    userDoc = userDocOrUid;
  }

  const email = _.get(userDoc, 'auth.email');

  if (!email) {
    assistant.warn('Marketing.sync(): No email found in user doc, skipping');
    return {};
  }

  const shouldSync = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;
  const syncProviders = providers || DEFAULT_PROVIDERS;
  const results = {};

  if (!shouldSync) {
    assistant.log('Marketing.sync(): Skipping providers (testing mode)');
    return results;
  }

  assistant.log('Marketing.sync():', { email });

  const firstName = _.get(userDoc, 'personal.name.first');
  const lastName = _.get(userDoc, 'personal.name.last');
  const source = _.get(userDoc, 'attribution.utm.tags.utm_source');
  const promises = [];

  if (syncProviders.includes('sendgrid') && process.env.SENDGRID_API_KEY) {
    promises.push(
      sendgridProvider.buildFields(userDoc).then((customFields) =>
        sendgridProvider.addContact({
          email,
          firstName,
          lastName,
          customFields,
        })
      ).then((r) => { results.sendgrid = r; })
    );
  }

  if (syncProviders.includes('beehiiv') && process.env.BEEHIIV_API_KEY) {
    promises.push(
      beehiivProvider.addContact({
        email,
        firstName,
        lastName,
        source,
        customFields: beehiivProvider.buildFields(userDoc),
      }).then((r) => { results.beehiiv = r; })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.sync() result:', results);

  return results;
};

/**
 * Remove a contact from all providers.
 *
 * @param {string} email - Email address to remove
 * @param {object} [options]
 * @param {Array<string>} [options.providers] - Which providers to remove from (default: all available)
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.remove = async function (email, options) {
  const self = this;
  const assistant = self.assistant;
  const { providers } = options || {};

  if (!email) {
    assistant.warn('Marketing.remove(): No email provided, skipping');
    return {};
  }

  const removeProviders = providers || DEFAULT_PROVIDERS;
  const results = {};

  assistant.log('Marketing.remove():', { email });

  const promises = [];

  if (removeProviders.includes('sendgrid') && process.env.SENDGRID_API_KEY) {
    promises.push(
      sendgridProvider.removeContact(email)
        .then((r) => { results.sendgrid = r; })
    );
  }

  if (removeProviders.includes('beehiiv') && process.env.BEEHIIV_API_KEY) {
    promises.push(
      beehiivProvider.removeContact(email)
        .then((r) => { results.beehiiv = r; })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.remove() result:', results);

  return results;
};

/**
 * Create and optionally schedule a marketing campaign (SendGrid Single Send).
 *
 * @param {object} settings
 * @param {string} settings.name - Campaign name
 * @param {string} settings.subject - Email subject
 * @param {string} [settings.template] - Template shortcut or SendGrid template ID
 * @param {string} [settings.sender] - Sender category ('marketing', 'newsletter', etc.)
 * @param {Array<string>} [settings.segments] - Segment IDs to target
 * @param {Array<string>} [settings.lists] - List IDs to target
 * @param {boolean} [settings.all] - Target all contacts
 * @param {string|number} [settings.sendAt] - ISO datetime or 'now' to schedule immediately
 * @param {Array<string>} [settings.categories] - Email categories
 * @returns {{ success: boolean, id?: string, scheduled?: boolean, error?: string }}
 */
Marketing.prototype.sendCampaign = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: 'SENDGRID_API_KEY not set' };
  }

  const templateId = TEMPLATES[settings.template] || settings.template || TEMPLATES['default'];

  // Resolve sender
  const sender = SENDERS[settings.sender] || SENDERS['marketing'];
  const brand = Manager.config?.brand;
  const brandDomain = brand?.contact?.email?.split('@')[1];

  const from = settings.from || {
    email: `${sender.localPart}@${brandDomain}`,
    name: sender.displayName.replace('{brand}', brand?.name || ''),
  };

  // Build send_to targeting
  const sendTo = {};

  if (settings.all) {
    sendTo.all = true;
  }
  if (settings.lists && settings.lists.length) {
    sendTo.list_ids = settings.lists;
  }
  if (settings.segments && settings.segments.length) {
    sendTo.segment_ids = settings.segments;
  }

  // ASM group
  const asmGroupId = settings.group != null
    ? (GROUPS[settings.group] || settings.group)
    : sender.group;

  // Categories
  const categories = _.uniq([
    'marketing',
    brand?.id,
    ...require('node-powertools').arrayify(settings.categories),
  ].filter(Boolean));

  assistant.log('Marketing.sendCampaign():', { name: settings.name, sendTo, templateId });

  // Create the Single Send
  const createResult = await sendgridProvider.createSingleSend({
    name: settings.name,
    subject: settings.subject,
    templateId,
    from,
    sendTo,
    asmGroupId,
    categories,
  });

  if (!createResult.success) {
    assistant.error('Marketing.sendCampaign() create failed:', createResult.error);
    return createResult;
  }

  // Schedule if sendAt is provided
  if (settings.sendAt) {
    const sendAt = settings.sendAt === 'now' ? 'now' : new Date(settings.sendAt).toISOString();

    const scheduleResult = await sendgridProvider.scheduleSingleSend(createResult.id, sendAt);

    if (!scheduleResult.success) {
      assistant.error('Marketing.sendCampaign() schedule failed:', scheduleResult.error);
      return { success: false, id: createResult.id, error: scheduleResult.error };
    }

    assistant.log('Marketing.sendCampaign() scheduled:', createResult.id);

    return { success: true, id: createResult.id, scheduled: true };
  }

  // Created but not scheduled (draft)
  return { success: true, id: createResult.id, scheduled: false };
};

/**
 * Cancel a scheduled campaign.
 *
 * @param {string} campaignId - Single Send ID
 * @returns {{ success: boolean, error?: string }}
 */
Marketing.prototype.cancelCampaign = async function (campaignId) {
  const self = this;
  const assistant = self.assistant;

  assistant.log('Marketing.cancelCampaign():', campaignId);

  return sendgridProvider.cancelSingleSend(campaignId);
};

/**
 * Get a campaign by ID.
 *
 * @param {string} campaignId - Single Send ID
 * @returns {object|null}
 */
Marketing.prototype.getCampaign = async function (campaignId) {
  return sendgridProvider.getSingleSend(campaignId);
};

/**
 * List campaigns with optional status filter.
 *
 * @param {object} [options]
 * @param {string} [options.status] - Filter: draft, scheduled, triggered
 * @returns {Array<object>}
 */
Marketing.prototype.listCampaigns = async function (options) {
  return sendgridProvider.listSingleSends(options);
};

module.exports = Marketing;
