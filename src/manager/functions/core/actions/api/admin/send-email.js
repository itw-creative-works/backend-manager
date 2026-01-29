const { FieldValue } = require('firebase-admin/firestore');
const _ = require('lodash');
const moment = require('moment');
const powertools = require('node-powertools');
const crypto = require('crypto');

// SendGrid limit for scheduled emails (72 hours, but use 71 for buffer)
const SEND_AT_LIMIT = 71;

function Module() {}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Load libraries
    const { admin } = self.libraries;

    // Initialize SendGrid
    const sendgrid = Manager.require('@sendgrid/mail');
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    self.sendgrid = sendgrid;

    // Check if user is admin
    if (!payload.user.authenticated) {
      return reject(assistant.errorify(`Authentication required.`, {code: 401}));
    } else if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, { code: 403 }));
    }

    // Check for SendGrid key
    if (!process.env.SENDGRID_API_KEY) {
      return reject(assistant.errorify(`SendGrid API key not configured.`, { code: 500 }));
    }

    // Log request
    assistant.log('Request:', payload.data.payload);

    // Build email object
    const email = await self.defaultize().catch(e => e);

    // Log email
    assistant.log('Email:', email, JSON.stringify(email, null, 2));

    // Check if error
    if (email instanceof Error) {
      return reject(assistant.errorify(email.message, { code: 400 }));
    }

    // Check for duplicate emails being sent
    const uniqueResult = await self.ensureFirstInstance(email);

    // If not unique, return early
    if (!uniqueResult) {
      return resolve({
        data: {
          status: 'non-unique',
        },
      });
    }

    // If scheduled beyond SendGrid's limit, queue it
    if (email.sendAt && email.sendAt >= moment().add(SEND_AT_LIMIT, 'hours').unix()) {
      await self.saveToEmailQueue(email).catch(e => e);

      return resolve({
        data: {
          status: 'queued',
          options: email,
          response: null,
        },
      });
    }

    // Send email via SendGrid
    const send = await sendgrid.send(email).catch(e => e);

    // Check if error
    if (send instanceof Error) {
      const e = send?.response?.body?.errors || send;
      assistant.error('Email send failed:', e);
      return reject(assistant.errorify(`Failed to send email: ${JSON.stringify(e)}`, { code: 500, sentry: true }));
    }

    // Extract message id
    const messageId = send[0].headers['x-message-id'];

    assistant.log('Email send succeeded:', messageId, send);

    // Clear email before storage
    const emailCloned = _.cloneDeepWith(email, (value) => {
      if (typeof value === 'undefined') {
        return null;
      }
    });
    delete emailCloned.dynamicTemplateData._stringified;

    // Save email to firestore for audit trail
    await admin.firestore().doc(`emails/${messageId}`)
      .set({
        id: messageId,
        request: emailCloned,
        body: {
          html: '',
          text: '',
        },
        created: assistant.meta.startTime,
      })
      .then((r) => {
        assistant.log(`Email save succeeded ${messageId}`);
      })
      .catch((e) => {
        assistant.error(`Email save failed ${messageId}`, e);
      });

    // Return success
    return resolve({
      data: {
        status: 'sent',
        options: email,
        response: send,
      },
    });
  });
};

Module.prototype.defaultize = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const fetch = Manager.require('wonderful-fetch');

    const options = payload.data.payload;
    const email = {
      dynamicTemplateData: {
        email: {},
        personalization: {},
        signoff: {},
        app: {},
        user: {},
        data: {},
      },
    };

    // Set defaults
    options.copy = typeof options.copy === 'undefined' ? true : options.copy;
    options.ensureUnique = typeof options.ensureUnique === 'undefined' ? true : options.ensureUnique;
    options.categories = powertools.arrayify(options.categories || []);

    email.to = powertools.arrayify(options.to || []);
    email.cc = powertools.arrayify(options.cc || []);
    email.bcc = powertools.arrayify(options.bcc || []);
    email.replyTo = options.replyTo || null;
    email.subject = options.subject || null;
    email.sendAt = options.sendAt || null;

    email.templateId = options.template || 'd-b7f8da3c98ad49a2ad1e187f3a67b546';
    email.asm = {
      groupId: options.group || 24077,
    };

    // Set dynamic template data
    email.dynamicTemplateData.data = options.data || {};

    email.dynamicTemplateData.email = {};
    email.dynamicTemplateData.email.id = Manager.require('uuid').v4();
    email.dynamicTemplateData.email.subject = options?.data?.email?.subject || null;
    email.dynamicTemplateData.email.preview = options?.data?.email?.preview || null;
    email.dynamicTemplateData.email.body = options?.data?.email?.body || null;
    email.dynamicTemplateData.email.unsubscribeUrl = options?.data?.email?.unsubscribeUrl || null;
    email.dynamicTemplateData.email.categories = [];
    email.dynamicTemplateData.email.footer = {};
    email.dynamicTemplateData.email.footer.text = options?.data?.email?.footer?.text || null;

    email.dynamicTemplateData.personalization = options?.data?.personalization || {};

    email.dynamicTemplateData.signoff = options?.data?.signoff || {};
    email.dynamicTemplateData.signoff.type = options?.data?.signoff?.type || 'team';

    if (email.dynamicTemplateData.signoff.type === 'personal') {
      email.dynamicTemplateData.signoff.image = options?.data?.signoff?.image
        || 'https://cdn.itwcreativeworks.com/assets/ian-wiedenman/images/website/ian-wiedenman-headshot-2021-color-1024x1024.jpg';
      email.dynamicTemplateData.signoff.name = options?.data?.signoff?.name || 'Ian Wiedenman, CEO';
      email.dynamicTemplateData.signoff.url = options?.data?.signoff?.url || 'https://ianwiedenman.com';
      email.dynamicTemplateData.signoff.urlText = options?.data?.signoff?.urlText || '@ianwieds';
    }

    email.dynamicTemplateData.user = Manager.User(options.user, { defaults: false, prune: false }).properties;

    // Get app configuration from Manager.config.brand (backend-manager-config.json)
    const brand = Manager.config?.brand;
    if (!brand) {
      return reject(new Error('Missing brand configuration in backend-manager-config.json'));
    }

    // Build app object from brand config
    const app = {
      id: brand.id,
      name: brand.name,
      url: brand.url,
      email: brand.contact?.email,
      images: brand.images || {},
    };

    if (!app.email) {
      return reject(new Error('Missing brand.contact.email in backend-manager-config.json'));
    }

    email.dynamicTemplateData.app = app;

    // Add user to recipients
    email.to.push({
      email: email.dynamicTemplateData.user.auth.email,
      name: email.dynamicTemplateData.user.personal.name.first,
    });

    // Add carbon copy recipients
    if (options.copy) {
      email.cc.push({
        email: email.dynamicTemplateData.app.email,
        name: email.dynamicTemplateData.app.name,
      });
      email.bcc.push(
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

    // Set email properties
    email.replyTo = email.replyTo || email.dynamicTemplateData.app.email;
    email.subject = email.subject || email.dynamicTemplateData.email.subject;
    email.dynamicTemplateData.email.subject = email.dynamicTemplateData.email.subject || email.subject;
    email.from = options.from || {
      email: email.dynamicTemplateData.app.email,
      name: email.dynamicTemplateData.app.name,
    };
    email.sendAt = options.sendAt;

    // Set categories
    email.categories = ['transactional', email.dynamicTemplateData.app.id, ...options.categories];

    // Remove duplicates from email lists
    email.to = filter(email.to);
    email.cc = filter(email.cc);
    email.bcc = filter(email.bcc);
    email.categories = _.uniq(email.categories);

    // Remove cc/bcc entries that are also in to
    email.cc = email.cc.filter(obj => !email.to.some(obj2 => obj.email === obj2.email));
    email.bcc = email.bcc.filter(obj => !email.to.some(obj2 => obj.email === obj2.email));

    // Try to get contact name from SendGrid
    await fetch(`https://api.sendgrid.com/v3/marketing/contacts/search/emails`, {
      method: 'post',
      response: 'json',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        emails: email.to.map(obj => obj.email),
      },
    })
      .then((json) => {
        assistant.log('Got contact names', json);

        // Update names from contacts
        email.to.forEach((to) => {
          const match = json.result[to.email];
          if (match) {
            email.to[0].name = match.contact.first_name || email.dynamicTemplateData.user.personal.name.first;
          }
        });
      })
      .catch((e) => {
        if (e.status === 404) {
          assistant.log('Contact does not exist in database');
        } else {
          assistant.error('Failed to get contact names', e);
        }
      });

    // Log resolved email
    assistant.log('Resolved email.to', email.to);

    // Delete empty names
    email.to.forEach((to) => {
      if (!to.name) {
        delete to.name;
      }
    });

    // Validate required fields
    if (!email.to.length || !email.to[0].email) {
      return reject(new Error('Parameter to is required with at least one email'));
    }

    if (!email.templateId && !options.html) {
      return reject(new Error('Parameter <template> is required'));
    }

    if (!email.asm.groupId) {
      return reject(new Error('Parameter <group> is required'));
    }

    if (!email.subject) {
      return reject(new Error('Parameter <subject> is required'));
    }

    // Set personalization data
    email.dynamicTemplateData.personalization = {
      email: email.to[0].email,
      name: email.to[0].name,
    };

    // Build unsubscribe URL
    email.dynamicTemplateData.email.unsubscribeUrl = `https://itwcreativeworks.com/portal/account/email-preferences?email=${encode(email.to[0].email)}&asmId=${encode(email.asm.groupId)}&templateId=${encode(email.templateId)}&appName=${email.dynamicTemplateData.app.name}&appUrl=${email.dynamicTemplateData.app.url}`;
    email.dynamicTemplateData.email.categories = email.categories;
    email.dynamicTemplateData.email.carbonCopy = options.copy;
    email.dynamicTemplateData.email.ensureUnique = options.ensureUnique;

    // Handle raw HTML content (overrides template)
    if (options.html) {
      email.content = [
        {
          type: 'text/html',
          value: options.html,
        },
      ];
      delete email.templateId;
    }

    // Set SendGrid options
    email.substitutionWrappers = ['{{', '}}'];
    email.headers = {
      'List-Unsubscribe': `<${email.dynamicTemplateData.email.unsubscribeUrl}>`,
    };

    // Generate email hash for deduplication
    email.hash = crypto.createHash('sha256');
    email.hash.update(
      email.to.map(obj => obj.email).join(',')
      + email.from.email
      + email.subject
      + options.categories.join(',')
    );
    email.hash = email.hash.digest('hex');

    // Clone and clean data for stringified version
    const emailClonedData = _.cloneDeep(email.dynamicTemplateData);
    emailClonedData.app.sponsorships = {};
    email.dynamicTemplateData._stringified = JSON.stringify(emailClonedData, null, 2);

    return resolve(email);
  });
};

Module.prototype.saveToEmailQueue = function (email) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    const { admin } = self.libraries;

    // Clear email before storage
    const emailCloned = _.cloneDeepWith(email, (value) => {
      if (typeof value === 'undefined') {
        return null;
      }
    });
    delete emailCloned.dynamicTemplateData._stringified;

    assistant.log(`saveToEmailQueue(): Saving email ${email.dynamicTemplateData.email.id} to email-queue`, emailCloned);

    await admin.firestore().doc(`email-queue/${email.dynamicTemplateData.email.id}`)
      .set(emailCloned)
      .then((r) => {
        assistant.log(`saveToEmailQueue(): Success ${email.dynamicTemplateData.email.id}`);
        return resolve();
      })
      .catch((e) => {
        assistant.error(`saveToEmailQueue(): Failed ${email.dynamicTemplateData.email.id}`, e);
        return reject(e);
      });
  });
};

Module.prototype.ensureFirstInstance = function (email) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const timeout = assistant.isDevelopment() ? 3000 : 45000;
    const { admin } = self.libraries;

    const hash = email.hash;
    const id = email.dynamicTemplateData.email.id;
    const options = payload.data.payload;

    assistant.log(`ensureFirstInstance(): Checking for unique email hash=${hash}, id=${id}`);

    // Skip uniqueness check if disabled
    if (!options.ensureUnique) {
      assistant.log(`ensureFirstInstance(): Skipping unique email check`);
      return resolve(true);
    }

    // Save email to temporary storage
    await admin.firestore().doc(`temporary/email-queue`).set({
      [hash]: {
        [id]: assistant.meta.startTime.timestampUNIX,
      },
    }, { merge: true })
      .then((doc) => {
        assistant.log(`ensureFirstInstance(): Saved email to temporary storage`, hash);
      })
      .catch((e) => {
        assistant.error(`ensureFirstInstance(): Failed to save email to temporary storage`, hash, e);
      });

    // Wait for timeout to allow duplicates to register
    assistant.log(`ensureFirstInstance(): Waiting for ${timeout / 1000} sec`);
    await powertools.poll(async (index) => {
      return false;
    }, { interval: 1000, timeout: timeout })
      .catch((e) => {
        assistant.log(`ensureFirstInstance(): Timeout reached`);
      });

    // Check if this is the first instance
    const result = await admin.firestore().doc(`temporary/email-queue`).get()
      .then((doc) => doc.data()?.[hash] || {})
      .catch((e) => ({}));

    const length = Object.keys(result).length;
    const isFirstInstance = length === 1 || result[id] === Math.min(...Object.values(result));

    assistant.log(`ensureFirstInstance(): Result`, result);
    assistant.log(`ensureFirstInstance(): Result isFirstInstance`, length, isFirstInstance);

    if (isFirstInstance) {
      // Delete email from temporary storage
      await admin.firestore().doc(`temporary/email-queue`).set({
        [hash]: FieldValue.delete(),
      }, { merge: true })
        .then((doc) => {
          assistant.log(`ensureFirstInstance(): Deleted email from temporary storage`, hash);
        })
        .catch((e) => {
          assistant.error(`ensureFirstInstance(): Failed to delete email from temporary storage`, hash, e);
        });

      return resolve(true);
    } else {
      assistant.warn(`ensureFirstInstance(): Email is not unique`, hash, length, result);
      return resolve(false);
    }
  });
};

// Helper to URL-encode base64
function encode(s) {
  return encodeURIComponent(Buffer.from(String(s)).toString('base64'));
}

// Helper to filter and deduplicate email array
function filter(array) {
  return array
    .filter(obj => obj.email && typeof obj.email === 'string')
    .map(obj => JSON.stringify(obj))
    .filter((obj, index, self) => self.indexOf(obj) === index)
    .map(obj => JSON.parse(obj));
}

module.exports = Module;
