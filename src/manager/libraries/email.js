/**
 * Shared email library for building and sending emails via SendGrid
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
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
});

// SendGrid limit for scheduled emails (72 hours, but use 71 for buffer)
const SEND_AT_LIMIT = 71;

// Template shortcut map — callers use readable paths instead of SendGrid IDs
// Paths mirror the email website structure: {category}/{subcategory}/{name}
const TEMPLATES = {
  // v2 templates
  'main/basic/card': 'd-1cd2eee44b6340268c964cd7971d49b9',
  'main/engagement/feedback': 'd-319ab5c9d5074b21926a93562d6f41f6',
  'main/misc/app-download-link': 'd-fc8b4834d7e1472896fe7e46152029f4',
  'main/order/confirmation': 'd-5371ac2b4e3b490bbce51bfc2922ece8',
  'main/order/payment-failed': 'd-e56af0ac62364bfb9e50af02854e2cd3',
  'main/order/payment-recovered': 'd-d6dbd17a260a4755b34a852ba09c2454',
  'main/order/cancellation-requested': 'd-78074f3e8c844146bf263b86fc8d5ecf',
  'main/order/cancelled': 'd-39041132e6b24e5ebf0e95bce2d94dba',
  'main/order/plan-changed': 'd-399086311bbb48b4b77bc90b20fb9d0a',
  'main/order/trial-ending': 'd-af8ab499cbfb4d56918b4118f44343b0',
  'main/order/refunded': 'd-aa47fdbffa2b4ca9b73b6256e963e49f',
  'main/order/abandoned-cart': 'd-d8b3fa67e2b44b398dc280d0576bf1b7',
};

// "default" resolves to the basic card template
TEMPLATES['default'] = TEMPLATES['main/basic/card'];

// Group shortcut map — SendGrid ASM group IDs
const GROUPS = {
  'default': 24077,
  'marketing': 25927,
  'account': 25928,
};

function Email(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;
  self.admin = self.Manager.libraries.admin;

  return self;
}

/**
 * Build a complete SendGrid email object from settings.
 *
 * @param {object} settings - Email settings (to, cc, bcc, subject, template, etc.)
 * @returns {object} SendGrid-ready email object
 * @throws {Error} On validation failure
 */
Email.prototype.build = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const admin = self.admin;
  const assistant = self.assistant;
  const powertools = require('node-powertools');

  // Normalize recipients
  let to = normalizeRecipients(settings.to);
  let cc = normalizeRecipients(settings.cc);
  let bcc = normalizeRecipients(settings.bcc);

  // Resolve any uid: prefixed recipients from Firestore
  [to, cc, bcc] = await Promise.all([
    resolveRecipients(to, admin, assistant),
    resolveRecipients(cc, admin, assistant),
    resolveRecipients(bcc, admin, assistant),
  ]);

  // Build user template data from settings.user (for legacy callers that pass user object)
  const userProperties = Manager.User(settings.user || {}).properties;

  // Get brand config
  const brand = Manager.config?.brand;

  if (!brand) {
    throw errorWithCode('Missing brand configuration in backend-manager-config.json', 400);
  }

  const brandData = _.cloneDeep(brand);
  brandData.images = sanitizeImagesForEmail(brandData.images || {});

  if (!brandData.contact?.email) {
    throw errorWithCode('Missing brand.contact.email in backend-manager-config.json', 400);
  }

  const copy = settings.copy ?? true;

  // Add carbon copy recipients
  if (copy) {
    cc.push({
      email: brandData.contact.email,
      name: brandData.name,
    });
    bcc.push(
      {
        email: 'support@itwcreativeworks.com',
        name: 'ITW Creative Works',
      },
      {
        email: 'parser+carboncopy@sendgrid-parser.itwcreativeworks.com',
        name: 'ITW Creative Works (Carbon Copy)',
      }
    );
  }

  // Deduplicate all lists
  ({ to, cc, bcc } = deduplicateRecipients(to, cc, bcc));

  // Delete empty names
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

  const templateId = TEMPLATES[settings.template] || settings.template || TEMPLATES['default'];
  const groupId = GROUPS[settings.group] || settings.group || GROUPS['default'];

  // Build categories
  const categories = _.uniq([
    'transactional',
    brandData.id,
    ...powertools.arrayify(settings.categories),
  ]);

  // Normalize sendAt
  const sendAt = normalizeSendAt(settings.sendAt);

  // Build unsubscribe URL
  // Generate HMAC signature for unsubscribe link verification
  const crypto = require('crypto');
  const unsubSig = crypto.createHmac('sha256', process.env.UNSUBSCRIBE_HMAC_KEY).update(to[0].email.toLowerCase()).digest('hex');

  const unsubscribeUrl = `${Manager.project.websiteUrl}/portal/email-preferences?email=${encode(to[0].email)}&asmId=${encode(groupId)}&templateId=${encode(templateId)}&sig=${unsubSig}`;

  // Build signoff
  const signoff = settings?.data?.signoff || {};
  signoff.type = signoff.type || 'team';

  if (signoff.type === 'personal') {
    signoff.image = signoff.image
      || 'https://cdn.itwcreativeworks.com/assets/ian-wiedenman/images/website/ian-wiedenman-headshot-2021-color-1024x1024.jpg';
    signoff.name = signoff.name || 'Ian Wiedenman, CEO';
    signoff.url = signoff.url || 'https://ianwiedenman.com';
    signoff.urlText = signoff.urlText || '@ianwieds';
  }

  // Process markdown in body fields
  if (settings?.data?.body?.message) {
    settings.data.body.message = md.render(settings.data.body.message);
  }
  if (settings?.data?.email?.body) {
    settings.data.email.body = md.render(settings.data.email.body);
  }

  // Build dynamic template data
  const dynamicTemplateData = {
    email: {
      id: Manager.require('uuid').v4(),
      subject: settings?.data?.email?.subject || subject,
      preview: settings?.data?.email?.preview || null,
      body: settings?.data?.email?.body || null,
      unsubscribeUrl,
      categories,
      footer: {
        text: settings?.data?.email?.footer?.text || null,
      },
      carbonCopy: copy,
    },
    personalization: {
      email: to[0].email,
      name: to[0].name,
      ...settings?.data?.personalization,
    },
    signoff,
    brand: brandData,
    user: userProperties,
    data: settings.data || {},
  };

  // Build the email object
  const email = {
    to,
    cc,
    bcc,
    from: settings.from || { email: brandData.contact.email, name: brandData.name },
    replyTo: settings.replyTo || brandData.contact.email,
    subject,
    templateId,
    asm: { groupId },
    categories,
    dynamicTemplateData,
    substitutionWrappers: ['{{', '}}'],
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    },
  };

  // Set sendAt
  if (sendAt) {
    email.sendAt = sendAt;
  }

  // Handle raw HTML override
  if (settings.html) {
    email.content = [{ type: 'text/html', value: settings.html }];
    delete email.templateId;
  }

  // Build stringified version for template rendering
  const clonedData = _.cloneDeep(dynamicTemplateData);
  clonedData.brand.sponsorships = {};
  email.dynamicTemplateData._stringified = JSON.stringify(clonedData, null, 2);

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
Email.prototype.send = async function (settings) {
  const self = this;
  const Manager = self.Manager;
  const admin = self.admin;
  const assistant = self.assistant;

  assistant.log(`Email.send(): to=${JSON.stringify(settings.to)}, subject=${settings.subject}, template=${settings.template}`);

  // Build email from settings (throws with code: 400 on validation failure)
  const email = await self.build(settings);

  // Initialize SendGrid
  const sendgrid = Manager.require('@sendgrid/mail');
  sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

  // If scheduled beyond the limit, queue it
  if (email.sendAt && email.sendAt >= moment().add(SEND_AT_LIMIT, 'hours').unix()) {
    await saveToEmailQueue(email, admin, assistant);

    return {
      status: 'queued',
      options: email,
      response: null,
    };
  }

  // Send via SendGrid
  const send = await sendgrid.send(email).catch(e => e);

  if (send instanceof Error) {
    const details = send?.response?.body?.errors || send;
    assistant.error('Email send failed:', details);
    throw errorWithCode(`Failed to send email: ${JSON.stringify(details)}`, 500);
  }

  // Extract message ID
  const messageId = send[0].headers['x-message-id'];

  assistant.log('Email send succeeded:', messageId, send);

  // Save audit trail (non-blocking)
  saveAuditTrail(email, messageId, admin, assistant);

  // Track analytics
  if (assistant.analytics) {
    assistant.analytics.event('admin/email', { status: 'sent' });
  }

  return {
    status: 'sent',
    options: email,
    response: send,
  };
};

// --- Private helpers ---

/**
 * Normalize recipient input into a consistent array of { email, name? } objects.
 * Entries with a `uid:` prefix are marked with `_uid` for later Firestore resolution.
 */
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
      if (item.startsWith('uid:')) {
        result.push({ _uid: item.slice(4) });
      } else {
        result.push({ email: item });
      }
    } else if (typeof item === 'object' && item.email) {
      result.push({ email: item.email, ...(item.name && { name: item.name }) });
    }
  }

  return result;
}

/**
 * Resolve any uid-prefixed recipients by fetching user docs from Firestore.
 */
async function resolveRecipients(recipients, admin, assistant) {
  const uidEntries = recipients.filter(r => r._uid);
  const nonUidEntries = recipients.filter(r => !r._uid);

  if (uidEntries.length === 0) {
    return nonUidEntries;
  }

  // Fetch all UIDs in parallel
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
    });
  }

  return [...nonUidEntries, ...resolved];
}

/**
 * Deduplicate recipients within each list and cross-dedup cc/bcc against to.
 */
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

/**
 * Normalize sendAt to a unix timestamp (seconds).
 */
function normalizeSendAt(sendAt) {
  if (!sendAt && sendAt !== 0) {
    return null;
  }

  if (typeof sendAt === 'number') {
    // If it looks like milliseconds (> year 2100 in seconds), convert
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

/**
 * Save email to queue for deferred sending (beyond 71h limit)
 */
async function saveToEmailQueue(email, admin, assistant) {
  const emailId = email.dynamicTemplateData.email.id;

  // Clone and clean before storage
  const emailCloned = _.cloneDeepWith(email, (value) => {
    if (typeof value === 'undefined') {
      return null;
    }
  });
  delete emailCloned.dynamicTemplateData._stringified;

  assistant.log(`saveToEmailQueue(): Saving email ${emailId}`);

  await admin.firestore().doc(`email-queue/${emailId}`)
    .set(emailCloned)
    .then(() => assistant.log(`saveToEmailQueue(): Success ${emailId}`))
    .catch(e => assistant.error(`saveToEmailQueue(): Failed ${emailId}`, e));
}

/**
 * Save sent email to Firestore for audit trail (non-blocking)
 */
function saveAuditTrail(email, messageId, admin, assistant) {
  // Clone and clean before storage
  const emailCloned = _.cloneDeepWith(email, (value) => {
    if (typeof value === 'undefined') {
      return null;
    }
  });
  delete emailCloned.dynamicTemplateData._stringified;

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

/**
 * Create an Error with a code property for distinguishing build (400) vs send (500) failures.
 */
function errorWithCode(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Convert SVG image URLs to PNG equivalents — email clients don't render SVGs.
 * CDN naming convention: `-x.svg` → `-1024.png`
 */
function sanitizeImagesForEmail(images) {
  const result = {};

  for (const [key, value] of Object.entries(images)) {
    if (typeof value === 'string' && value.endsWith('.svg')) {
      result[key] = value.replace(/-x\.svg$/, '-1024.png');
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * URL-encode a value as base64
 */
function encode(s) {
  return encodeURIComponent(Buffer.from(String(s)).toString('base64'));
}

module.exports = Email;
