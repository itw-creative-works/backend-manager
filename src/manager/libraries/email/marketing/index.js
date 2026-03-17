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
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

const { TEMPLATES, GROUPS, SENDERS } = require('../constants.js');
const { tagLinks } = require('../utm.js');
const sendgridProvider = require('../providers/sendgrid.js');
const beehiivProvider = require('../providers/beehiiv.js');

function Marketing(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.admin = self.Manager.libraries.admin;

  // Resolve provider availability from config + env
  const marketing = self.Manager.config?.marketing || {};

  self.providers = {
    sendgrid: marketing.sendgrid?.enabled !== false && !!process.env.SENDGRID_API_KEY,
    beehiiv: marketing.beehiiv?.enabled !== false && !!process.env.BEEHIIV_API_KEY,
  };

  return self;
}

/**
 * Add a new contact to enabled providers (lightweight — no full user doc needed).
 * Used by newsletter subscribe and admin bulk import.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {string} [options.source] - UTM source
 * @param {object} [options.customFields] - Extra SendGrid custom fields (keyed by field ID)
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.add = async function (options) {
  const self = this;
  const assistant = self.assistant;
  const { email, firstName, lastName, company, source, customFields } = options;

  if (!email) {
    assistant.warn('Marketing.add(): No email provided, skipping');
    return {};
  }

  if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) {
    assistant.log('Marketing.add(): Skipping providers (testing mode)');
    return {};
  }

  assistant.log('Marketing.add():', { email });

  const results = {};
  const promises = [];

  if (self.providers.sendgrid) {
    promises.push(
      sendgridProvider.addContact({
        email,
        firstName,
        lastName,
        company,
        customFields,
      }).then((r) => { results.sendgrid = r; })
    );
  }

  if (self.providers.beehiiv) {
    promises.push(
      beehiivProvider.addContact({
        email,
        firstName,
        lastName,
        company,
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
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.sync = async function (userDocOrUid) {
  const self = this;
  const assistant = self.assistant;

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

  if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) {
    assistant.log('Marketing.sync(): Skipping providers (testing mode)');
    return {};
  }

  assistant.log('Marketing.sync():', { email });

  const firstName = _.get(userDoc, 'personal.name.first');
  const lastName = _.get(userDoc, 'personal.name.last');
  const source = _.get(userDoc, 'attribution.utm.tags.utm_source');
  const results = {};
  const promises = [];

  if (self.providers.sendgrid) {
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

  if (self.providers.beehiiv) {
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
 * Remove a contact from all enabled providers.
 *
 * @param {string} email - Email address to remove
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.remove = async function (email) {
  const self = this;
  const assistant = self.assistant;

  if (!email) {
    assistant.warn('Marketing.remove(): No email provided, skipping');
    return {};
  }

  assistant.log('Marketing.remove():', { email });

  const results = {};
  const promises = [];

  if (self.providers.sendgrid) {
    promises.push(
      sendgridProvider.removeContact(email)
        .then((r) => { results.sendgrid = r; })
    );
  }

  if (self.providers.beehiiv) {
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
 * Create and optionally schedule a marketing campaign across enabled providers.
 *
 * Unified interface — each provider handles what it supports:
 *   SendGrid: Single Send with lists, segments, excludes, templates
 *   Beehiiv:  Post with segments, HTML content, scheduling
 *
 * @param {object} settings
 * @param {string} settings.name - Campaign name (internal, used as title for Beehiiv)
 * @param {string} settings.subject - Email subject line
 * @param {string} [settings.preheader] - Email preview text
 * @param {string} [settings.template] - Template shortcut or SendGrid template ID
 * @param {string} [settings.content] - Markdown content (converted to HTML per provider)
 * @param {object} [settings.data] - Dynamic template variables (SendGrid only)
 * @param {string} [settings.sender] - Sender category ('marketing', 'newsletter', etc.)
 * @param {Array<string>} [settings.lists] - SendGrid list IDs (defaults to brand list)
 * @param {Array<string>} [settings.segments] - Segment IDs to target (both providers)
 * @param {Array<string>} [settings.excludeSegments] - Segment IDs to exclude (both providers)
 * @param {boolean} [settings.all] - Target all contacts (SendGrid only)
 * @param {string} [settings.sendAt] - ISO datetime, 'now', or omit for draft
 * @param {string} [settings.group] - ASM unsubscribe group (SendGrid only)
 * @param {Array<string>} [settings.categories] - Analytics categories (SendGrid only)
 * @param {Array<string>} [settings.providers] - Override which providers to use
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Marketing.prototype.sendCampaign = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  const useProviders = settings.providers || Object.keys(self.providers).filter(p => self.providers[p]);
  const results = {};
  const promises = [];

  // Convert markdown content to HTML, then tag links with UTM params
  const brand = Manager.config?.brand;
  let contentHtml = settings.content ? md.render(settings.content) : '';

  if (contentHtml) {
    contentHtml = tagLinks(contentHtml, {
      brandUrl: brand?.url,
      brandId: brand?.id,
      campaign: settings.name,
      type: 'marketing',
      utm: settings.utm,
    });
  }

  // Resolve SSOT segment keys → provider segment IDs
  const resolvedSegments = {};

  if (useProviders.includes('sendgrid') && self.providers.sendgrid) {
    const segmentIdMap = await sendgridProvider.resolveSegmentIds();

    resolvedSegments.sendgrid = {
      segments: (settings.segments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
      excludeSegments: (settings.excludeSegments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
    };
  }

  // Beehiiv: segment resolution will go here when Beehiiv segments are supported

  assistant.log('Marketing.sendCampaign():', {
    name: settings.name,
    providers: useProviders,
    sendAt: settings.sendAt || 'draft',
  });

  // --- SendGrid ---
  if (useProviders.includes('sendgrid') && self.providers.sendgrid) {
    const sgSettings = {
      ...settings,
      segments: resolvedSegments.sendgrid?.segments || [],
      excludeSegments: resolvedSegments.sendgrid?.excludeSegments || [],
    };

    promises.push(
      self._sendCampaignSendGrid(sgSettings, contentHtml)
        .then((r) => { results.sendgrid = r; })
        .catch((e) => { results.sendgrid = { success: false, error: e.message }; })
    );
  }

  // --- Beehiiv ---
  if (useProviders.includes('beehiiv') && self.providers.beehiiv) {
    promises.push(
      beehiivProvider.createPost({
        title: settings.name,
        subject: settings.subject,
        preheader: settings.preheader,
        content: contentHtml,
        sendAt: settings.sendAt,
        segments: settings.segments,
        excludeSegments: settings.excludeSegments,
      })
        .then((r) => { results.beehiiv = r; })
        .catch((e) => { results.beehiiv = { success: false, error: e.message }; })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.sendCampaign() results:', results);

  return results;
};

/**
 * SendGrid-specific campaign creation (Single Send + optional schedule).
 * @private
 */
Marketing.prototype._sendCampaignSendGrid = async function (settings, contentHtml) {
  const self = this;
  const Manager = self.Manager;

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

  // Create the Single Send
  const createResult = await sendgridProvider.createSingleSend({
    name: settings.name,
    subject: settings.subject,
    preheader: settings.preheader,
    templateId,
    from,
    sendTo,
    excludeSegments: settings.excludeSegments,
    asmGroupId,
    categories,
    dynamicTemplateData: {
      ...settings.data,
      ...(contentHtml ? { content: contentHtml } : {}),
    },
  });

  if (!createResult.success) {
    return createResult;
  }

  // Schedule if sendAt is provided
  if (!settings.sendAt) {
    return { success: true, id: createResult.id, scheduled: false };
  }

  const sendAt = settings.sendAt === 'now' ? 'now' : new Date(settings.sendAt).toISOString();
  const scheduleResult = await sendgridProvider.scheduleSingleSend(createResult.id, sendAt);

  if (!scheduleResult.success) {
    return { success: false, id: createResult.id, error: scheduleResult.error };
  }

  return { success: true, id: createResult.id, scheduled: true };
};

/**
 * Cancel a scheduled campaign (SendGrid only).
 *
 * @param {string} campaignId - Single Send ID
 * @returns {{ success: boolean, error?: string }}
 */
Marketing.prototype.cancelCampaign = async function (campaignId) {
  const self = this;
  self.assistant.log('Marketing.cancelCampaign():', campaignId);

  return sendgridProvider.cancelSingleSend(campaignId);
};

/**
 * Get a campaign by ID (SendGrid only).
 *
 * @param {string} campaignId - Single Send ID
 * @returns {object|null}
 */
Marketing.prototype.getCampaign = async function (campaignId) {
  return sendgridProvider.getSingleSend(campaignId);
};

/**
 * List campaigns with optional status filter (SendGrid only).
 *
 * @param {object} [options]
 * @param {string} [options.status] - Filter: draft, scheduled, triggered
 * @returns {Array<object>}
 */
Marketing.prototype.listCampaigns = async function (options) {
  return sendgridProvider.listSingleSends(options);
};

module.exports = Marketing;
