const fetch = require('wonderful-fetch');
const moment = require('moment');
const { inferContact } = require('../../../libraries/infer-contact.js');

const MAX_POLL_TIME_MS = 30000;
const POLL_INTERVAL_MS = 500;
const MAX_ACCOUNT_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /user/signup - Complete user signup
 *
 * Called by client after account creation to:
 * 1. Poll for user doc to exist (waits for onCreate to complete)
 * 2. Validate (already processed, account age)
 * 3. Gather all data (client details, inferred contact)
 * 4. Write everything to user doc in one merge
 * 5. Process affiliate referral (writes to referrer's doc)
 * 6. Send welcome emails + add to marketing lists (non-blocking)
 */
module.exports = async ({ assistant, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID
  const uid = settings.uid;

  // Require admin to signup other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  assistant.log(`signup(): Starting for ${uid}`, settings);

  // 1. Poll for user doc to exist (wait for onCreate to complete)
  const userDoc = await pollForUserDoc(assistant, uid);

  if (!userDoc) {
    return assistant.respond('User document not found after waiting. Please try again.', { code: 500 });
  }

  assistant.log(`signup(): User doc found for ${uid}`);

  // 2. Check if signup has already been processed
  if (userDoc.flags?.signupProcessed) {
    return assistant.respond('Signup has already been processed', { code: 400 });
  }

  // 3. Backup check: reject if account is older than 5 minutes
  const authUser = await admin.auth().getUser(uid).catch((e) => e);

  if (authUser instanceof Error) {
    return assistant.respond(`Failed to get auth user: ${authUser.message}`, { code: 500 });
  }

  const accountAgeMs = Date.now() - new Date(authUser.metadata.creationTime).getTime();

  if (accountAgeMs > MAX_ACCOUNT_AGE_MS) {
    return assistant.respond('Account is too old to process signup', { code: 400 });
  }

  // 4. Gather all data, then write once
  const email = user.auth.email;
  const inferred = await inferUserContact(assistant, email);
  const userRecord = buildUserRecord(assistant, settings, inferred);

  assistant.log(`signup(): Writing user record for ${uid}`, userRecord);

  await admin.firestore().doc(`users/${uid}`)
    .set(userRecord, { merge: true });

  // 5. Process affiliate referral (writes to referrer's doc, not this user's)
  await processAffiliate(assistant, uid, settings);

  // 6. Send emails + marketing (non-blocking, fire-and-forget)
  sendEmailsAndMarketing(assistant, uid, email, inferred);

  return assistant.respond({ signedUp: true });
};

/**
 * Poll for user doc to exist (wait for onCreate to complete)
 */
async function pollForUserDoc(assistant, uid) {
  const { admin } = assistant.Manager.libraries;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const doc = await admin.firestore().doc(`users/${uid}`)
      .get()
      .catch((e) => {
        assistant.error(`pollForUserDoc(): Error fetching doc:`, e);
        return null;
      });

    if (doc && doc.exists && doc.data()?.auth?.uid) {
      return doc.data();
    }

    assistant.log(`pollForUserDoc(): Waiting for user doc ${uid}...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  assistant.error(`pollForUserDoc(): Timeout waiting for user doc ${uid}`);
  return null;
}

/**
 * Build the full user record: client details, attribution, and inferred contact
 */
function buildUserRecord(assistant, settings, inferred) {
  const Manager = assistant.Manager;
  const attribution = settings.attribution;

  // Legacy support: if affiliateCode exists, normalize to new format
  if (settings.affiliateCode && !attribution.affiliate?.code) {
    attribution.affiliate = { code: settings.affiliateCode };
  }

  const record = {
    flags: {
      signupProcessed: true,
    },
    activity: {
      ...settings.context,
      geolocation: {
        ...(settings.context?.geolocation || {}),
        ...assistant.request.geolocation,
      },
      client: {
        ...(settings.context?.client || {}),
        ...assistant.request.client,
      },
    },
    attribution: attribution || {},
    metadata: Manager.Metadata().set({ tag: 'user/signup' }),
  };

  // Add inferred name/company if available
  if (inferred) {
    record.personal = {
      ...(inferred.firstName || inferred.lastName ? {
        name: {
          ...(inferred.firstName ? { first: inferred.firstName } : {}),
          ...(inferred.lastName ? { last: inferred.lastName } : {}),
        },
      } : {}),
      ...(inferred.company ? { company: { name: inferred.company } } : {}),
    };
  }

  return record;
}

/**
 * Infer name/company from email using AI (or regex fallback)
 * Returns the inferred contact info, or null on failure
 */
async function inferUserContact(assistant, email) {
  try {
    const inferred = await inferContact(email, assistant);

    if (!inferred?.firstName && !inferred?.lastName && !inferred?.company) {
      return null;
    }

    assistant.log(`signup(): Inferred contact: ${inferred.firstName || ''} ${inferred.lastName || ''}, company=${inferred.company || ''} (method=${inferred.method})`);

    return inferred;
  } catch (e) {
    assistant.error('signup(): Name inference failed:', e);
    return null;
  }
}

/**
 * Process affiliate referral if affiliate code provided
 * Writes to the referrer's doc (not the current user's)
 */
async function processAffiliate(assistant, uid, settings) {
  const { admin } = assistant.Manager.libraries;
  const affiliateCode = settings.attribution?.affiliate?.code
    || settings.affiliateCode
    || null;

  if (!affiliateCode) {
    return;
  }

  assistant.log(`processAffiliate(): Looking for referrer with code ${affiliateCode}`);

  const snapshot = await admin.firestore().collection('users')
    .where('affiliate.code', '==', affiliateCode)
    .get()
    .catch((e) => {
      assistant.error(`processAffiliate(): Failed to find referrer:`, e);
      throw e;
    });

  if (snapshot.empty) {
    assistant.log(`processAffiliate(): No referrer found with code ${affiliateCode}`);
    return;
  }

  // Update the first matching referrer
  const referrerDoc = snapshot.docs[0];
  const referrerData = referrerDoc.data() || {};

  let referrals = referrerData?.affiliate?.referrals || [];
  referrals = Array.isArray(referrals) ? referrals : [];

  referrals.push({
    uid: uid,
    timestamp: assistant.meta.startTime.timestamp,
  });

  assistant.log(`processAffiliate(): Appending referral to ${referrerDoc.id}`, referrals);

  await admin.firestore().doc(`users/${referrerDoc.id}`)
    .set({
      affiliate: {
        referrals: referrals,
      },
    }, { merge: true })
    .then(() => {
      assistant.log(`processAffiliate(): Success`);
    })
    .catch((e) => {
      assistant.error(`processAffiliate(): Failed to update referrer:`, e);
    });
}

/**
 * Send welcome emails and add to marketing lists (non-blocking, fire-and-forget)
 */
function sendEmailsAndMarketing(assistant, uid, email, inferred) {
  const Manager = assistant.Manager;
  const shouldSend = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (!shouldSend) {
    assistant.log(`signup(): Skipping emails/marketing (BEM_TESTING=true, TEST_EXTENDED_MODE not set)`);
    return;
  }

  assistant.log(`signup(): Sending emails/adding to marketing for ${uid}`);

  // Add to marketing lists (SendGrid + Beehiiv) via centralized endpoint
  fetch(`${Manager.project.apiUrl}/backend-manager/marketing/contact`, {
    method: 'POST',
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      email: email,
      firstName: inferred?.firstName || '',
      lastName: inferred?.lastName || '',
      source: 'user:signup',
    },
  }).catch(e => assistant.error('signup(): marketing-contact failed:', e));

  // Send welcome emails (non-blocking, fire-and-forget)
  // Pass UID so email.js fetches user doc → name + template data
  sendWelcomeEmail(assistant, uid).catch(e => assistant.error('signup(): sendWelcomeEmail failed:', e));
  sendCheckupEmail(assistant, uid).catch(e => assistant.error('signup(): sendCheckupEmail failed:', e));
  sendFeedbackEmail(assistant, uid).catch(e => assistant.error('signup(): sendFeedbackEmail failed:', e));
}

/**
 * Send welcome email (immediate)
 */
function sendWelcomeEmail(assistant, uid) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['account/welcome'],
    subject: `Welcome to ${Manager.config.brand.name}!`,
    template: 'default',
    copy: false,
    data: {
      email: {
        preview: `Welcome aboard! I'm Ian, the CEO and founder of ${Manager.config.brand.name}. I'm here to ensure your journey with us gets off to a great start.`,
      },
      body: {
        title: `Welcome to ${Manager.config.brand.name}!`,
        message: `Welcome aboard!

I'm Ian, the founder and CEO of **${Manager.config.brand.name}**, and I'm thrilled to have you with us. Your journey begins today, and we are committed to supporting you every step of the way.

We are dedicated to ensuring your experience is exceptional. Feel free to reply directly to this email with any questions you may have.

Thank you for choosing **${Manager.config.brand.name}**. Here's to new beginnings!`,
      },
      signoff: {
        type: 'personal',
        name: 'Ian Wiedenman, CEO',
        url: `https://ianwiedenman.com?utm_source=welcome-email&utm_medium=email&utm_campaign=${Manager.config.brand.id}`,
        urlText: '@ianwieds',
      },
    },
  })
    .then((result) => {
      assistant.log('sendWelcomeEmail(): Success', result.status);
      return result;
    });
}

/**
 * Send checkup email (7 days after signup)
 */
function sendCheckupEmail(assistant, uid) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['account/checkup'],
    subject: `How's your experience with ${Manager.config.brand.name}?`,
    template: 'default',
    copy: false,
    sendAt: moment().add(5, 'days').unix(),
    data: {
      email: {
        preview: `Checking in from ${Manager.config.brand.name} to see how things are going. Let us know if you have any questions or feedback!`,
      },
      body: {
        title: `How's everything going?`,
        message: `Hi there,

It's Ian again from **${Manager.config.brand.name}**. Just checking in to see how things are going for you.

Have you had a chance to explore all our features? Any questions or feedback for us?

We're always here to help, so don't hesitate to reach out. Just reply to this email and we'll get back to you as soon as possible.

Thank you for choosing **${Manager.config.brand.name}**. Here's to new beginnings!`,
      },
      signoff: {
        type: 'personal',
        name: 'Ian Wiedenman, CEO',
        url: `https://ianwiedenman.com?utm_source=checkup-email&utm_medium=email&utm_campaign=${Manager.config.brand.id}`,
        urlText: '@ianwieds',
      },
    },
  })
    .then((result) => {
      assistant.log('sendCheckupEmail(): Success', result.status);
      return result;
    });
}

/**
 * Send feedback email (10 days after signup)
 */
function sendFeedbackEmail(assistant, uid) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['engagement/feedback'],
    subject: `Want to share your feedback about ${Manager.config.brand.name}?`,
    template: 'main/engagement/feedback',
    copy: false,
    sendAt: moment().add(10, 'days').unix(),
  })
    .then((result) => {
      assistant.log('sendFeedbackEmail(): Success', result.status);
      return result;
    });
}
