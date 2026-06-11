/**
 * Marketing email library — contact syncing + campaign management
 *
 * Pipeline: prepare (shared) → content → audience → render → deliver
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
 * - routes/user/signup (sync on signup — call site also gates on consent to skip the paid mailbox check)
 * - Payment transition handlers (sync on subscription change)
 * - Auth on-delete handler (remove contact)
 * - Campaign cron jobs (send campaigns)
 *
 * Consent gate: add() and sync() skip users whose consent.marketing.status is the
 * literal string 'revoked' and return { blocked: 'consent', email }. Missing consent,
 * null, or any other value proceeds — legacy users have no consent field and must
 * keep syncing. remove() is always safe and stays ungated.
 */
const _ = require('lodash');

const { GROUPS } = require('../constants.js');
const { tagLinks } = require('../utm.js');
const { validate } = require('../validation.js');
const prepare = require('../prepare.js');
const sendgridProvider = require('../providers/sendgrid.js');
const beehiivProvider = require('../providers/beehiiv.js');

function Marketing(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.admin = self.Manager.libraries.admin;

  const marketing = self.Manager.config?.marketing || {};

  self.providers = {
    campaigns: marketing.campaigns?.enabled !== false && !!process.env.SENDGRID_API_KEY,
    newsletter: marketing.newsletter?.enabled !== false && !!process.env.BEEHIIV_API_KEY,
  };

  return self;
}

// ============================================================
// Contact management (add / sync / remove)
// ============================================================

/**
 * Consent gate — true ONLY when consent.marketing.status is the literal string 'revoked'.
 * Missing consent, null, or any other value proceeds — legacy users have no consent field
 * and must keep syncing.
 *
 * @param {object|null|undefined} userDoc - User doc data (or null/undefined when no user exists)
 * @returns {boolean}
 */
function isMarketingRevoked(userDoc) {
  return userDoc?.consent?.marketing?.status === 'revoked';
}

/**
 * Look up a user doc by email (same query the marketing webhook processors use).
 * Returns the doc data, or null when no user matches OR the lookup fails (fail open —
 * a rare duplicate add is recoverable; silently dropping contacts is not).
 *
 * @param {object} admin - firebase-admin instance
 * @param {object} assistant - Assistant (for logging)
 * @param {string} email - Email address
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(admin, assistant, email) {
  const snapshot = await admin.firestore().collection('users')
    .where('auth.email', '==', email.trim().toLowerCase())
    .limit(1)
    .get()
    .catch((e) => {
      assistant.error('Marketing: User lookup by email failed (proceeding without consent gate):', e);
      return null;
    });

  if (!snapshot || snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

// Exposed as statics for plain-node unit tests (consent-gate.test.js)
Marketing.isMarketingRevoked = isMarketingRevoked;
Marketing.findUserByEmail = findUserByEmail;

Marketing.prototype.add = async function (options) {
  const self = this;
  const assistant = self.assistant;
  const { email, firstName, lastName, company, source, customFields } = options;

  if (!email) {
    assistant.warn('Marketing.add(): No email provided, skipping');
    return {};
  }

  // Consent gate — if this email maps to a user who revoked marketing consent, never
  // re-add them. No user doc → proceed (pure newsletter contact). Lookup failure →
  // proceed (fail open, logged in findUserByEmail).
  const userDoc = await findUserByEmail(self.admin, assistant, email);

  if (isMarketingRevoked(userDoc)) {
    assistant.warn(`Marketing.add(): Consent revoked, skipping: ${email}`);
    return { blocked: 'consent', email };
  }

  const validation = await validate(email);
  if (!validation.valid) {
    assistant.warn(`Marketing.add(): Validation failed, skipping: ${email}`, validation.checks);
    return { blocked: 'validation', email, checks: validation.checks };
  }

  if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) {
    assistant.log('Marketing.add(): Skipping providers (testing mode)');
    return {};
  }

  assistant.log('Marketing.add():', { email });

  const results = {};
  const promises = [];

  if (self.providers.campaigns) {
    promises.push(
      sendgridProvider.addContact({ email, firstName, lastName, company, customFields })
        .then((r) => { results.campaigns = r; })
        .catch((e) => {
          assistant.error('Marketing.add(): SendGrid failed:', e);
          results.campaigns = { success: false, error: e.message };
        })
    );
  }

  if (self.providers.newsletter) {
    promises.push(
      beehiivProvider.addContact({ email, firstName, lastName, company, source })
        .then((r) => { results.newsletter = r; })
        .catch((e) => {
          assistant.error('Marketing.add(): Beehiiv failed:', e);
          results.newsletter = { success: false, error: e.message };
        })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.add() result:', results);

  return results;
};

Marketing.prototype.sync = async function (userDocOrUid) {
  const self = this;
  const assistant = self.assistant;

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

  // Consent gate — never re-add a user who revoked marketing consent (payment-event
  // syncs, admin re-syncs, and batch syncs all funnel through here).
  if (isMarketingRevoked(userDoc)) {
    assistant.warn(`Marketing.sync(): Consent revoked, skipping: ${email}`);
    return { blocked: 'consent', email };
  }

  const validation = await validate(email);
  if (!validation.valid) {
    assistant.warn(`Marketing.sync(): Validation failed, skipping: ${email}`, validation.checks);
    return { blocked: 'validation', email, checks: validation.checks };
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

  if (self.providers.campaigns) {
    promises.push(
      sendgridProvider.buildFields(userDoc).then((customFields) =>
        sendgridProvider.addContact({ email, firstName, lastName, customFields })
      ).then((r) => { results.campaigns = r; })
        .catch((e) => {
          assistant.error('Marketing.sync(): SendGrid failed:', e);
          results.campaigns = { success: false, error: e.message };
        })
    );
  }

  if (self.providers.newsletter) {
    promises.push(
      beehiivProvider.addContact({
        email, firstName, lastName, source,
        customFields: beehiivProvider.buildFields(userDoc),
      }).then((r) => { results.newsletter = r; })
        .catch((e) => {
          assistant.error('Marketing.sync(): Beehiiv failed:', e);
          results.newsletter = { success: false, error: e.message };
        })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.sync() result:', results);

  return results;
};

Marketing.prototype.remove = async function (email) {
  const self = this;
  const assistant = self.assistant;

  if (!email) {
    assistant.warn('Marketing.remove(): No email provided, skipping');
    return {};
  }

  if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) {
    assistant.log('Marketing.remove(): Skipping providers (testing mode)');
    return {};
  }

  assistant.log('Marketing.remove():', { email });

  const results = {};
  const promises = [];

  if (self.providers.campaigns) {
    promises.push(
      sendgridProvider.removeContact(email)
        .then((r) => { results.campaigns = r; })
        .catch((e) => {
          assistant.error('Marketing.remove(): SendGrid failed:', e);
          results.campaigns = { success: false, error: e.message };
        })
    );
  }

  if (self.providers.newsletter) {
    promises.push(
      beehiivProvider.removeContact(email)
        .then((r) => { results.newsletter = r; })
        .catch((e) => {
          assistant.error('Marketing.remove(): Beehiiv failed:', e);
          results.newsletter = { success: false, error: e.message };
        })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.remove() result:', results);

  return results;
};

// ============================================================
// Campaign management
// ============================================================

/**
 * Create and optionally schedule a marketing campaign across enabled providers.
 *
 * Steps:
 *   1. Resolve template variables ({brand.name}, {season.name}, etc.)
 *   2. Render content (markdown → HTML, UTM tagging)
 *   3. Resolve segments per provider
 *   4. Dispatch to provider-specific senders (SendGrid, Beehiiv)
 *
 * @param {object} settings
 * @param {string} settings.name - Campaign name
 * @param {string} settings.subject - Email subject line
 * @param {string} [settings.preheader] - Preview text
 * @param {string} [settings.template] - Template name ('card', 'plain', etc.)
 * @param {object} [settings.data] - Template data (content goes in data.content: { title, message, button, discountCode })
 * @param {string} [settings.contentHtml] - Pre-rendered HTML (newsletter generator only — skips markdown)
 * @param {string} [settings.sender] - Sender category
 * @param {Array<string>} [settings.segments] - Segment keys to target
 * @param {Array<string>} [settings.excludeSegments] - Segment keys to exclude
 * @param {Array<string>} [settings.lists] - SendGrid list IDs
 * @param {boolean} [settings.all] - Target all contacts
 * @param {string} [settings.sendAt] - ISO datetime, 'now', or omit for draft
 * @param {string|number} [settings.group] - ASM unsubscribe group
 * @param {Array<string>} [settings.categories] - Analytics categories
 * @param {boolean} [settings.test] - Test mode (targets test_admin only)
 * @param {Array<string>} [settings.providers] - Override which providers to use
 * @returns {{ campaigns?: object, newsletter?: object }}
 */
Marketing.prototype.sendCampaign = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  const useProviders = settings.providers || Object.keys(self.providers).filter(p => self.providers[p]);

  // --- 1. Resolve template variables ---
  const brand = Manager.config?.brand;
  const templateContext = buildTemplateContext(brand, settings);
  let resolved = resolveTemplateVars(settings, templateContext);

  if (settings.test) {
    assistant.log('Marketing.sendCampaign(): TEST MODE — targeting test_admin segment only');
    resolved = {
      ...resolved,
      name: `[TEST] ${resolved.name}`,
      segments: ['test_admin'],
      excludeSegments: [],
      lists: [],
      all: false,
    };
  }

  // --- 2. Render content ---
  // Newsletter generator pre-renders HTML and passes it as top-level contentHtml.
  // Human-authored campaigns pass markdown in data.content.message.
  const callerContent = resolved.data?.content || {};
  const contentHtml = resolved.contentHtml
    || callerContent.html
    || prepare.renderContent(
      { content: callerContent.message },
      {
        brandUrl: brand?.url,
        brandId: brand?.id,
        campaign: resolved.name,
        type: 'marketing',
        utm: resolved.utm,
      },
    );

  // --- 3. Resolve segments per provider ---
  const resolvedSegments = {};

  if (useProviders.includes('campaigns') && self.providers.campaigns) {
    const segmentIdMap = await sendgridProvider.resolveSegmentIds();
    resolvedSegments.campaigns = {
      segments: (resolved.segments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
      excludeSegments: (resolved.excludeSegments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
    };
  }

  if (useProviders.includes('newsletter') && self.providers.newsletter) {
    const segmentIdMap = await beehiivProvider.resolveSegmentIds();
    resolvedSegments.newsletter = {
      segments: (resolved.segments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
      excludeSegments: (resolved.excludeSegments || []).map(key => segmentIdMap[key] || key).filter(Boolean),
    };
  }

  assistant.log('Marketing.sendCampaign():', {
    name: resolved.name,
    providers: useProviders,
    sendAt: settings.sendAt || 'draft',
  });

  // --- 4. Dispatch to providers ---
  const results = {};
  const promises = [];

  if (useProviders.includes('campaigns') && self.providers.campaigns) {
    const sgSettings = {
      ...resolved,
      segments: resolvedSegments.campaigns?.segments || [],
      excludeSegments: resolvedSegments.campaigns?.excludeSegments || [],
    };

    promises.push(
      _sendCampaignSendGrid(Manager, sgSettings, contentHtml)
        .then((r) => { results.campaigns = r; })
        .catch((e) => { results.campaigns = { success: false, error: e.message }; })
    );
  }

  if (useProviders.includes('newsletter') && self.providers.newsletter) {
    promises.push(
      beehiivProvider.createPost({
        title: resolved.name,
        subject: resolved.subject,
        preheader: resolved.preheader,
        content: contentHtml,
        sendAt: settings.sendAt,
        segments: resolvedSegments.newsletter?.segments || [],
        excludeSegments: resolvedSegments.newsletter?.excludeSegments || [],
      })
        .then((r) => { results.newsletter = r; })
        .catch((e) => { results.newsletter = { success: false, error: e.message }; })
    );
  }

  await Promise.all(promises);

  assistant.log('Marketing.sendCampaign() results:', results);

  return results;
};

Marketing.prototype.cancelCampaign = async function (campaignId) {
  this.assistant.log('Marketing.cancelCampaign():', campaignId);
  return sendgridProvider.cancelSingleSend(campaignId);
};

Marketing.prototype.getCampaign = async function (campaignId) {
  return sendgridProvider.getSingleSend(campaignId);
};

Marketing.prototype.listCampaigns = async function (options) {
  return sendgridProvider.listSingleSends(options);
};

// ============================================================
// SendGrid campaign delivery (private)
// ============================================================

/**
 * SendGrid-specific: prepare → render → audience → create Single Send → schedule.
 *
 * @param {object} Manager
 * @param {object} settings - Resolved campaign settings
 * @param {string} contentHtml - Pre-rendered HTML body
 * @returns {{ success: boolean, id?: string, scheduled?: boolean, error?: string }}
 */
async function _sendCampaignSendGrid(Manager, settings, contentHtml) {
  // --- Prepare ---
  const { brand, brandDomain } = prepare.resolveBrand(Manager);
  const { from, groupId } = prepare.resolveSender(
    { sender: settings.sender || 'marketing', from: settings.from, group: settings.group },
    brand,
    brandDomain,
  );
  const categories = prepare.buildCategories('marketing', brand.id, settings.categories);
  const signoff = prepare.resolveSignoff(settings.signoff);

  // --- Render ---
  // Marketing Single Sends can't use per-recipient HMAC links (one HTML for all recipients).
  // Use SendGrid's ASM tag instead — replaced with a real per-recipient URL at delivery time.
  const unsubscribeUrl = '<%asm_group_unsubscribe_raw_url%>';

  const templateData = prepare.buildTemplateData({
    brand,
    subject: settings.subject,
    preview: settings.preheader,
    contentHtml,
    signoff,
    unsubscribeUrl,
    categories,
    callerData: settings.data,
  });

  const rendered = await prepare.render({
    brand,
    template: settings.template || 'card',
    data: templateData,
    utm: { campaign: settings.name || settings.template || 'campaign', type: 'marketing' },
  });

  // --- Audience ---
  const { sendTo, excludeSegments, cleanup } = await _resolveAudience(settings, brand);

  // --- Create Single Send ---
  const createResult = await sendgridProvider.createSingleSend({
    name: settings.name,
    subject: settings.subject,
    from,
    sendTo,
    excludeSegments,
    asmGroupId: groupId,
    categories,
    htmlContent: rendered.html,
  });

  if (!createResult.success) {
    await cleanup();
    return createResult;
  }

  // --- Schedule ---
  if (!settings.sendAt) {
    await cleanup();
    return { success: true, id: createResult.id, scheduled: false };
  }

  const sendAt = settings.sendAt === 'now' ? 'now' : new Date(settings.sendAt).toISOString();
  const scheduleResult = await sendgridProvider.scheduleSingleSend(createResult.id, sendAt);

  await cleanup();

  if (!scheduleResult.success) {
    return { success: false, id: createResult.id, error: scheduleResult.error };
  }

  return { success: true, id: createResult.id, scheduled: true };
}

/**
 * Resolve SendGrid audience targeting (lists, segments, brand-scoped dynamic segments).
 *
 * @param {object} settings - Resolved campaign settings
 * @param {object} brand - Resolved brand
 * @returns {{ sendTo: object, excludeSegments: string[], cleanup: Function }}
 */
async function _resolveAudience(settings, brand) {
  const sendTo = {};
  const cleanupFns = [];
  const isTest = settings.test;

  if (settings.all) {
    sendTo.all = true;
  } else if (settings.segments?.length) {
    const tempInclude = await sendgridProvider.createBrandScopedSegment(
      settings.segments,
      brand.id,
      { skipBrandFilter: isTest },
    );

    if (tempInclude) {
      sendTo.segment_ids = [tempInclude.segmentId];
      cleanupFns.push(tempInclude.cleanup);
    }
  } else if (settings.lists?.length) {
    sendTo.list_ids = settings.lists;
  } else {
    const brandListId = sendgridProvider.getListId();
    if (brandListId) {
      sendTo.list_ids = [brandListId];
    }
  }

  let excludeSegments = [];
  if (settings.excludeSegments?.length && !isTest) {
    const tempExclude = await sendgridProvider.createBrandScopedSegment(
      settings.excludeSegments,
      brand.id,
      { skipBrandFilter: true },
    );

    if (tempExclude) {
      excludeSegments = [tempExclude.segmentId];
      cleanupFns.push(tempExclude.cleanup);
    }
  }

  const cleanup = async () => {
    for (const fn of cleanupFns) {
      await fn();
    }
  };

  return { sendTo, excludeSegments, cleanup };
}

// ============================================================
// Campaign template variable resolution
// ============================================================

const SEASONS = {
  0: 'Winter', 1: 'Winter', 2: 'Spring', 3: 'Spring', 4: 'Spring', 5: 'Summer',
  6: 'Summer', 7: 'Summer', 8: 'Fall', 9: 'Fall', 10: 'Fall', 11: 'Winter',
};

const HOLIDAYS = {
  0: 'New Year', 1: 'Valentine\'s Day', 2: 'Spring', 3: 'Spring',
  4: 'Memorial Day', 5: 'Summer', 6: 'Independence Day', 7: 'Back to School',
  8: 'Labor Day', 9: 'Halloween', 10: 'Black Friday', 11: 'Christmas',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildTemplateContext(brand, settings) {
  const now = new Date();
  const month = now.getMonth();

  const discountCodes = require('../../payment/discount-codes.js');
  const discountCode = settings?.data?.content?.discountCode || settings?.discountCode;
  const discount = discountCode
    ? discountCodes.validate(discountCode)
    : { code: '', percent: '' };

  return {
    brand: brand || {},
    season: { name: SEASONS[month] },
    holiday: { name: HOLIDAYS[month] },
    date: {
      month: MONTH_NAMES[month],
      year: String(now.getFullYear()),
      full: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    },
    discount: {
      code: discount.code || '',
      percent: discount.percent || '',
    },
  };
}

function resolveTemplateVars(obj, context) {
  const template = require('node-powertools').template;

  if (typeof obj === 'string') {
    if (!obj.includes('{')) {
      return obj;
    }

    const resolved = template(obj, context);
    return resolved.replace(/\bnull\b|\bundefined\b/g, '').replace(/[^\S\n]{2,}/g, ' ').trim();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => resolveTemplateVars(item, context));
  }

  if (obj && typeof obj === 'object') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveTemplateVars(value, context);
    }

    return result;
  }

  return obj;
}

module.exports = Marketing;
