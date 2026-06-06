/**
 * Transactional email library — build and send individual emails via SendGrid
 *
 * Pipeline: prepare (shared) → recipients (transactional-only) → render → deliver
 *
 * Usage:
 *   const email = Manager.Email(assistant);
 *   const result = await email.send(settings);
 *
 * Used by:
 * - POST /admin/email route
 * - POST /general/email route
 * - Payment transition handlers (send-email.js)
 * - Auth on-create handler (welcome/checkup/feedback emails)
 */
const _ = require('lodash');
const moment = require('moment');
const pushid = require('pushid');

const { SEND_AT_LIMIT, errorWithCode } = require('../constants.js');
const { tagLinks } = require('../utm.js');
const prepare = require('../prepare.js');

function Transactional(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.admin = self.Manager.libraries.admin;

  return self;
}

/**
 * Build a complete SendGrid email object from settings.
 *
 * Steps:
 *   1. Resolve brand + sender (shared)
 *   2. Resolve recipients (transactional-only: normalize, UID lookup, CC, dedup)
 *   3. Build template data tree (shared) + render content through MJML
 *   4. Assemble SendGrid Mail Send object
 *
 * @param {object} settings - Email settings (to, cc, bcc, subject, template, etc.)
 * @returns {object} SendGrid-ready email object
 * @throws {Error} On validation failure
 */
Transactional.prototype.build = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const admin = self.admin;
  const assistant = self.assistant;

  // --- 1. Brand + sender ---
  const { brand, brandDomain } = prepare.resolveBrand(Manager);
  const { from, groupId } = prepare.resolveSender(settings, brand, brandDomain);
  const categories = prepare.buildCategories('transactional', brand.id, settings.categories);
  const signoff = prepare.resolveSignoff(settings?.data?.signoff);

  // TEMPORARY: shim for emails queued before the MJML migration (old template names)
  const LEGACY_TEMPLATE_MAP = { 'default': 'card', 'core/engagement/feedback': 'feedback' };
  const templateName = LEGACY_TEMPLATE_MAP[settings.template] || settings.template || 'card';

  // --- 2. Recipients ---
  let to = normalizeRecipients(settings.to);
  let cc = normalizeRecipients(settings.cc);
  let bcc = normalizeRecipients(settings.bcc);

  [to, cc, bcc] = await Promise.all([
    resolveRecipients(to, admin, assistant),
    resolveRecipients(cc, admin, assistant),
    resolveRecipients(bcc, admin, assistant),
  ]);

  // Extract user properties from primary recipient for template data
  const rawUserDoc = to[0]?._userDoc || {};
  const userProperties = Manager.User(rawUserDoc).properties;
  delete userProperties.api;
  delete userProperties.oauth2;
  delete userProperties.activity;
  delete userProperties.affiliate;
  delete userProperties.attribution;
  delete userProperties.flags;

  // Clean internal markers
  for (const list of [to, cc, bcc]) {
    for (const entry of list) {
      delete entry._userDoc;
    }
  }

  const copy = settings.copy ?? true;

  if (copy) {
    cc.push({ email: brand.contact.email, name: brand.name });
    bcc.push(
      { email: 'support@itwcreativeworks.com', name: 'ITW Creative Works' },
      { email: 'parser+carboncopy@sendgrid-parser.itwcreativeworks.com', name: 'ITW Creative Works (Carbon Copy)' },
    );
  }

  ({ to, cc, bcc } = deduplicateRecipients(to, cc, bcc));

  for (const list of [to, cc, bcc]) {
    for (const entry of list) {
      if (!entry.name) {
        delete entry.name;
      }
    }
  }

  // Validate
  if (!to.length || !to[0].email) {
    throw errorWithCode('Parameter to is required with at least one email', 400);
  }

  const subject = settings.subject || settings?.data?.email?.subject || null;

  if (!subject) {
    throw errorWithCode('Parameter subject is required', 400);
  }

  const preview = settings.preview || settings?.data?.email?.preview || null;

  // --- 3. Template data + render ---
  const unsubscribeUrl = prepare.buildUnsubscribeUrl({
    email: to[0].email,
    groupId,
    template: templateName,
    websiteUrl: Manager.project.websiteUrl,
  });

  // TEMPORARY: shim for emails queued before the MJML migration (data.body → data.content)
  if (settings?.data?.body && !settings?.data?.content) {
    settings.data.content = settings.data.body;
  }

  // Render markdown content to HTML (if provided)
  const utmCampaign = (settings.categories && settings.categories[0]) || settings.sender || templateName;
  const utmOptions = {
    brandUrl: brand.url,
    brandId: brand.id,
    campaign: utmCampaign,
    type: 'transactional',
    utm: settings.utm,
  };
  const contentHtml = prepare.renderContent(
    { content: settings?.data?.content?.message, html: settings?.data?.content?.html },
    utmOptions,
  );

  const templateData = prepare.buildTemplateData({
    brand,
    subject,
    preview,
    contentHtml,
    signoff,
    unsubscribeUrl,
    categories,
    copy,
    callerData: {
      personalization: { email: to[0].email, name: to[0].name },
      user: userProperties,
      ...settings.data,
    },
  });

  // Process markdown in any remaining body fields that the caller set directly
  const MarkdownIt = require('markdown-it');
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

  if (templateData.content?.message && typeof templateData.content.message === 'string' && !templateData.content.message.startsWith('<')) {
    templateData.content.message = tagLinks(md.render(templateData.content.message), utmOptions);
  }

  // Render through MJML template
  const rendered = await prepare.render({ brand, template: templateName, data: templateData });

  // --- 4. Assemble SendGrid object ---
  const sendAt = normalizeSendAt(settings.sendAt);

  const email = {
    to,
    cc,
    bcc,
    from,
    replyTo: settings.replyTo || from.email,
    subject,
    content: [{ type: 'text/html', value: rendered.html }],
    categories,
    asm: { groupId },
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
  };

  if (sendAt) {
    email.sendAt = sendAt;
  }

  // Raw HTML override — caller provides complete HTML, skip MJML
  if (settings.html) {
    email.content = [{ type: 'text/html', value: settings.html }];
  }

  return email;
};

/**
 * Build and send an email via SendGrid, or queue it if scheduled beyond the limit.
 * Calls .build() internally — callers only need to pass raw settings.
 *
 * @param {object} settings - Email settings (to, cc, bcc, subject, template, etc.)
 * @returns {{ status: string, options?: object, response?: object }}
 * @throws {Error} With code 400 for validation errors, code 500 for send failures
 */
Transactional.prototype.send = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const admin = self.admin;
  const assistant = self.assistant;

  assistant.log(`Email.send(): to=${JSON.stringify(settings.to)}, subject=${settings.subject}, template=${settings.template}`);

  const email = await self.build(settings);

  // Initialize SendGrid
  const sendgrid = Manager.require('@sendgrid/mail');
  sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

  // If scheduled beyond the limit, queue for later
  if (email.sendAt && email.sendAt >= moment().add(SEND_AT_LIMIT, 'hours').unix()) {
    await saveToEmailQueue(settings, email.sendAt, admin, assistant);

    return { status: 'queued', options: email, response: null };
  }

  // Send via SendGrid
  const send = await sendgrid.send(email).catch(e => e);

  if (send instanceof Error) {
    const details = send?.response?.body?.errors || send;
    assistant.error('Email send failed:', details);
    throw errorWithCode(`Failed to send email: ${JSON.stringify(details)}`, 500);
  }

  const messageId = send[0].headers['x-message-id'];
  assistant.log('Email send succeeded:', messageId, send);

  saveAuditTrail(email, messageId, admin, assistant);

  if (assistant.analytics) {
    assistant.analytics.event('admin/email', { status: 'sent' });
  }

  return { status: 'sent', options: email, response: send };
};

// --- Recipients (transactional-only) ---

function normalizeRecipients(input) {
  if (!input) {
    return [];
  }

  const items = Array.isArray(input) ? input : [input];
  const result = [];

  for (const item of items) {
    if (!item) {
      continue;
    }

    if (typeof item === 'string') {
      if (item.includes('@')) {
        result.push({ email: item });
      } else {
        result.push({ _uid: item });
      }
    } else if (typeof item === 'object' && item.auth?.email) {
      result.push({
        email: item.auth.email,
        ...(item.personal?.name?.first && { name: item.personal.name.first }),
        _userDoc: item,
      });
    } else if (typeof item === 'object' && item.email) {
      result.push({ email: item.email, ...(item.name && { name: item.name }) });
    }
  }

  return result;
}

async function resolveRecipients(recipients, admin, assistant) {
  const uidEntries = recipients.filter(r => r._uid);
  const nonUidEntries = recipients.filter(r => !r._uid);

  if (uidEntries.length === 0) {
    return nonUidEntries;
  }

  const snapshots = await Promise.all(
    uidEntries.map(entry =>
      admin.firestore().doc(`users/${entry._uid}`).get()
        .catch(e => {
          assistant.error(`resolveRecipients(): Failed to fetch user ${entry._uid}`, e);
          return null;
        })
    )
  );

  const resolved = [];

  for (let i = 0; i < uidEntries.length; i++) {
    const snap = snapshots[i];

    if (!snap || !snap.exists) {
      assistant.warn(`resolveRecipients(): User ${uidEntries[i]._uid} not found, skipping`);
      continue;
    }

    const data = snap.data();
    const email = data?.auth?.email;

    if (!email) {
      assistant.warn(`resolveRecipients(): User ${uidEntries[i]._uid} has no email, skipping`);
      continue;
    }

    resolved.push({
      email,
      ...(data?.personal?.name?.first && { name: data.personal.name.first }),
      _userDoc: data,
    });
  }

  return [...nonUidEntries, ...resolved];
}

function deduplicateRecipients(to, cc, bcc) {
  const dedup = (arr) => {
    const seen = new Set();

    return arr.filter(r => {
      if (!r.email || typeof r.email !== 'string') {
        return false;
      }

      const key = r.email.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  to = dedup(to);

  const toEmails = new Set(to.map(r => r.email.toLowerCase()));
  cc = dedup(cc).filter(r => !toEmails.has(r.email.toLowerCase()));

  const toCcEmails = new Set([...toEmails, ...cc.map(r => r.email.toLowerCase())]);
  bcc = dedup(bcc).filter(r => !toCcEmails.has(r.email.toLowerCase()));

  return { to, cc, bcc };
}

// --- Scheduling + persistence ---

function normalizeSendAt(sendAt) {
  if (!sendAt && sendAt !== 0) {
    return null;
  }

  if (typeof sendAt === 'number') {
    if (sendAt > 4102444800) {
      return Math.floor(sendAt / 1000);
    }
    return sendAt;
  }

  if (typeof sendAt === 'string') {
    const parsed = moment(sendAt);

    if (parsed.isValid()) {
      return parsed.unix();
    }
  }

  return null;
}

async function saveToEmailQueue(settings, sendAt, admin, assistant) {
  const emailId = pushid();

  const settingsCloned = _.cloneDeepWith(settings, (value) => {
    if (typeof value === 'undefined') {
      return null;
    }
  });

  assistant.log(`saveToEmailQueue(): Saving ${emailId}, sendAt=${sendAt}`);

  await admin.firestore().doc(`emails-queue/${emailId}`)
    .set({ settings: settingsCloned, sendAt })
    .then(() => assistant.log(`saveToEmailQueue(): Success ${emailId}`))
    .catch(e => assistant.error(`saveToEmailQueue(): Failed ${emailId}`, e));
}

function saveAuditTrail(email, messageId, admin, assistant) {
  const emailCloned = _.cloneDeepWith(email, (value) => {
    if (typeof value === 'undefined') {
      return null;
    }
  });

  admin.firestore().doc(`emails/${messageId}`)
    .set({
      id: messageId,
      request: emailCloned,
      body: { html: '', text: '' },
      created: assistant.meta.startTime,
    })
    .then(() => assistant.log(`Audit trail saved: ${messageId}`))
    .catch(e => assistant.error(`Audit trail failed: ${messageId}`, e));
}

module.exports = Transactional;
