const moment = require('moment');
const _ = require('lodash');
const { inferContact } = require('../../../libraries/infer-contact.js');
const { validate: validateEmail, isDisposable } = require('../../../libraries/email/validation.js');

const MAX_POLL_TIME_MS = 30000;
const POLL_INTERVAL_MS = 500;

/**
 * POST /user/signup - Complete user signup
 *
 * Called by client after account creation to:
 * 1. Poll for user doc to exist (waits for onCreate to complete)
 * 2. Validate (reject only if flags.signupProcessed is already true)
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

  // 3. Fetch the Auth user — needed for the canonical creationTime used to stamp
  //    metadata.created and consent timestamps. flags.signupProcessed (checked above) is
  //    the sole idempotency gate; there is intentionally no account-age window, so a
  //    legitimately-unprocessed account can complete signup whenever it retries.
  const authUser = await admin.auth().getUser(uid).catch((e) => e);

  if (authUser instanceof Error) {
    return assistant.respond(`Failed to get auth user: ${authUser.message}`, { code: 500 });
  }

  // 4. Gather all data, then write once
  const email = user.auth.email;
  const inferred = await inferUserContact(assistant, email);
  const userRecord = buildUserRecord(assistant, {
    settings,
    inferred,
    uid,
    email,
    creationTime: authUser.metadata.creationTime,
    existingDoc: userDoc,
  });

  assistant.log(`signup(): Writing user record for ${uid}`, userRecord);

  await admin.firestore().doc(`users/${uid}`)
    .set(userRecord, { merge: true });

  // 5. Process affiliate referral (writes to referrer's doc, not this user's)
  await processAffiliate(assistant, uid, email, settings);

  // 6. Send emails + marketing (non-blocking, fire-and-forget)
  // Gate marketing sync on explicit consent — never add a user to marketing lists without it
  if (userRecord.consent?.marketing?.status === 'granted') {
    syncMarketingContact(assistant, uid, email);
  } else {
    assistant.log(`signup(): Skipping marketing sync — consent.marketing.status is "${userRecord.consent?.marketing?.status}"`);
  }
  sendWelcomeEmails(assistant, uid, inferred?.firstName);

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
 * Build the complete user record to write at signup completion.
 *
 * Returns the WHOLE merged document (written without {merge}), layered deepest-first:
 *   1. Manager.User() full schema shape — guarantees every leaf exists (so a doc created by a
 *      partial path, e.g. onCreate never firing, still ends up schema-complete).
 *   2. the existing doc — real values win over the schema defaults, so we never clobber the
 *      user's api keys, subscription, roles, affiliate.code, or any custom/non-standard fields.
 *   3. the signup data — attribution / activity / consent / flags / personal we own at signup
 *      land on top.
 *
 * Why a full deep-merge instead of `.set(partial, {merge:true})`: Firestore's merge REPLACES a
 * map field rather than deep-merging it, so writing a partial `attribution` flattened onCreate's
 * full attribution object and the OMEGA migration had to re-add every leaf on every signup.
 * Deep-merging in JS and writing the whole doc avoids that entirely.
 */
function buildUserRecord(assistant, { settings, inferred, uid, email, creationTime, existingDoc }) {
  const Manager = assistant.Manager;

  // Inferred name/company (from AI/regex on the email) — only set when present.
  const personal = {};
  if (inferred?.firstName || inferred?.lastName) {
    personal.name = {
      ...(inferred.firstName ? { first: inferred.firstName } : {}),
      ...(inferred.lastName ? { last: inferred.lastName } : {}),
    };
  }
  if (inferred?.company) {
    personal.company = { name: inferred.company };
  }

  // Layer 1: full schema shape (every leaf present with defaults).
  const schemaShape = Manager.User({ auth: { uid, email } }).properties;

  // Layer 3: the data signup owns.
  const signupData = {
    auth: { uid, email },
    flags: { signupProcessed: true },
    activity: {
      ...settings.context,
      geolocation: {
        ...(settings.context?.geolocation || {}),
        ...assistant.request.geolocation,
      },
      client: {
        ...assistant.request.client,
        ...(settings.context?.client || {}),
      },
    },
    attribution: settings.attribution || {},
    consent: buildConsentRecord(assistant, settings.consent, creationTime, existingDoc?.consent),
    metadata: Manager.Metadata().set({ tag: 'user/signup' }),
    ...(Object.keys(personal).length ? { personal } : {}),
  };

  // metadata.created from Auth's creationTime (canonical), matching onCreate + the migration SSOT.
  if (creationTime) {
    const createdDate = new Date(creationTime);
    signupData.metadata.created = {
      timestamp: createdDate.toISOString(),
      timestampUNIX: Math.round(createdDate.getTime() / 1000),
    };
  }

  // Deep-merge: schema (base) ← existing doc (real values win) ← signup data (owned fields win).
  // _.merge mutates its first arg, so start from a fresh object.
  return _.merge({}, schemaShape, existingDoc || {}, signupData);
}

/**
 * Translate the client's lightweight consent payload into the canonical user-doc shape.
 *
 * Client sends: { legal: { granted, text }, marketing: { granted, text } }
 * Server writes: { legal: { status, grantedAt: {...} }, marketing: { status, grantedAt: {...}, revokedAt: {...} } }
 *
 * Server-derived time (not client-supplied) is authoritative — defends against clock
 * manipulation. Uses Auth's creationTime so consent timestamps match metadata.created.
 * IP is captured from request geolocation.
 *
 * Legal is REQUIRED — the client must send legal.granted=true. If missing/false we still
 * record what the client sent, but the route will not have reached this point in practice
 * (the signup-form HTML5-requires the legal checkbox).
 */
function buildConsentRecord(assistant, clientConsent, creationTime, existingConsent) {
  const consent = clientConsent || {};
  const ip = assistant.request.geolocation?.ip || null;

  // Stamp grantedAt/revokedAt from Auth's creationTime so consent timestamps match
  // metadata.created (the OMEGA migration treats metadata.created as the SSOT and reconciles
  // consent.grantedAt against it). Fall back to request start time if creationTime is absent.
  const createdDate = creationTime ? new Date(creationTime) : null;
  const timestamp = createdDate ? createdDate.toISOString() : assistant.meta.startTime.timestamp;
  const timestampUNIX = createdDate ? Math.round(createdDate.getTime() / 1000) : assistant.meta.startTime.timestampUNIX;

  // Build empty leaf shape — used wherever grantedAt or revokedAt is "not set"
  const emptyMeta = { timestamp: null, timestampUNIX: null, source: null, ip: null, text: null };

  // --- Legal ---
  const legalGranted = consent.legal?.granted === true;
  const legalText = typeof consent.legal?.text === 'string' ? consent.legal.text : null;

  let legal = legalGranted
    ? {
      status: 'granted',
      grantedAt: { timestamp, timestampUNIX, source: 'signup', ip, text: legalText },
    }
    : {
      status: 'revoked',
      grantedAt: { ...emptyMeta },
    };

  // --- Marketing ---
  const marketingGranted = consent.marketing?.granted === true;
  const marketingText = typeof consent.marketing?.text === 'string' ? consent.marketing.text : null;

  let marketing = marketingGranted
    ? {
      status: 'granted',
      grantedAt: { timestamp, timestampUNIX, source: 'signup', ip, text: marketingText },
      revokedAt: { ...emptyMeta },
    }
    : {
      status: 'revoked',
      grantedAt: { ...emptyMeta },
      // Record the decline with source=signup-form-declined. text=null (no message shown).
      revokedAt: { timestamp, timestampUNIX, source: 'signup', ip, text: null },
    };

  // Never DOWNGRADE an existing granted consent. A legacy account (signed up before this
  // flow, flags.signupProcessed never set) re-fires /user/signup on page load with empty
  // consent — which would compute status 'revoked' above and, on a {merge:true} write, wipe
  // out the consent they actually granted months ago. If the existing doc already has a
  // consent granted and the incoming payload doesn't explicitly re-grant it, preserve the
  // existing record. A genuine new grant or an at-signup decline (no prior grant) still applies.
  if (existingConsent?.legal?.status === 'granted' && legal.status !== 'granted') {
    legal = existingConsent.legal;
  }
  if (existingConsent?.marketing?.status === 'granted' && marketing.status !== 'granted') {
    marketing = existingConsent.marketing;
  }

  assistant.log(`buildConsentRecord: legal=${legal.status}, marketing=${marketing.status} (raw input legal.granted=${consent.legal?.granted}, marketing.granted=${consent.marketing?.granted})`);

  return { legal, marketing };
}

/**
 * Infer name/company from email using AI (or regex fallback)
 * Returns the inferred contact info, or null on failure
 */
async function inferUserContact(assistant, email) {
  try {
    const inferred = await inferContact(email, assistant);

    if (!inferred?.firstName && !inferred?.lastName && !inferred?.company) {
      assistant.log(`signup(): inferUserContact returned empty result for ${email} (method=${inferred?.method || 'unknown'})`);
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
async function processAffiliate(assistant, uid, email, settings) {
  const { admin } = assistant.Manager.libraries;
  const affiliateCode = settings.attribution?.affiliate?.code || null;

  if (!affiliateCode) {
    return;
  }

  // Skip referral credit for disposable email signups (affiliate fraud prevention)
  if (isDisposable(email)) {
    assistant.log(`processAffiliate(): Skipping referral — disposable email ${email}`);
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
 * Sync marketing contact (non-blocking, fire-and-forget)
 * Validates email first — skips sync for disposable domains
 */
async function syncMarketingContact(assistant, uid, email) {
  const Manager = assistant.Manager;
  const shouldSend = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (!shouldSend) {
    assistant.log(`signup(): Skipping marketing sync (BEM_TESTING=true, TEST_EXTENDED_MODE not set)`);
    return;
  }

  // Validate email before adding to marketing lists (disposable check only, no ZeroBounce cost)
  const validation = await validateEmail(email);

  if (!validation.valid) {
    assistant.log(`signup(): Skipping marketing sync — email validation failed:`, validation.checks);
    return;
  }

  const mailer = Manager.Email(assistant);
  mailer.sync(uid)
    .then((r) => assistant.log('signup(): Marketing sync:', r))
    .catch((e) => assistant.error('signup(): Marketing sync failed:', e));
}

/**
 * Send welcome, checkup, and feedback emails (non-blocking, fire-and-forget)
 */
function sendWelcomeEmails(assistant, uid, firstName) {
  const shouldSend = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (!shouldSend) {
    assistant.log(`signup(): Skipping welcome emails (BEM_TESTING=true, TEST_EXTENDED_MODE not set)`);
    return;
  }

  sendWelcomeEmail(assistant, uid, firstName).catch(e => assistant.error('signup(): sendWelcomeEmail failed:', e));
  sendDiscountNudgeEmail(assistant, uid, firstName).catch(e => assistant.error('signup(): sendDiscountNudgeEmail failed:', e));
  sendCheckupEmail(assistant, uid, firstName).catch(e => assistant.error('signup(): sendCheckupEmail failed:', e));
  sendFeedbackEmail(assistant, uid, firstName).catch(e => assistant.error('signup(): sendFeedbackEmail failed:', e));
}

/**
 * Send welcome email (immediate)
 */
function sendWelcomeEmail(assistant, uid, firstName) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);
  const greeting = firstName ? `Hey ${firstName}, welcome` : 'Welcome';

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['account/welcome'],
    subject: `Welcome to ${Manager.config.brand.name}!`,
    template: 'card',
    copy: false,
    data: {
      email: {
        preview: `Welcome aboard! I'm Ian, the CEO and founder of ${Manager.config.brand.name}. I'm here to ensure your journey with us gets off to a great start.`,
      },
      content: {
        title: `Welcome to ${Manager.config.brand.name}!`,
        message: `${greeting} aboard!

I'm Ian, the founder and CEO of **${Manager.config.brand.name}**, and I'm thrilled to have you with us. Your journey begins today, and we are committed to supporting you every step of the way.

We are dedicated to ensuring your experience is exceptional. Feel free to reply directly to this email with any questions you may have.

Thank you for choosing **${Manager.config.brand.name}**. Here's to new beginnings!`,
      },
      signoff: {
        type: 'personal',
        name: 'Ian Wiedenman, CEO',
        url: 'https://ianwiedenman.com',
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
 * Send discount-nudge email (24 hours after signup)
 *
 * A warm, personal check-in that offers a discount code in exchange for a reply.
 * Scheduled fire-and-forget via sendAt (same pattern as checkup/feedback) — there is
 * intentionally no premium check at send time, so a user who upgrades within 24h may
 * still receive it. The copy is deliberately worded as a friendly thank-you (not "you
 * haven't upgraded") so it reads fine regardless of the recipient's current plan.
 *
 * The reply itself is the goal: replies are a strong positive sender-reputation signal,
 * and a real human check-in lands in the Primary tab rather than Promotions. Inbound
 * reply handling (auto-issuing the code) is out of scope here — replies are handled
 * separately.
 *
 * Subject is personalized with the recipient's first name when available, and uses
 * intrigue framing ("something for you 🎁") rather than spam-trigger words ("free",
 * "claim", "bonus") to protect deliverability.
 */
function sendDiscountNudgeEmail(assistant, uid, firstName) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);
  const greeting = firstName ? `Hey ${firstName}` : 'Hey there';
  const subject = firstName
    ? `${firstName}, I've got something for you 🎁`
    : `I've got something for you 🎁`;

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['engagement/discount-nudge'],
    subject: subject,
    template: 'card',
    copy: false,
    sendAt: moment().add(24, 'hours').unix(),
    data: {
      email: {
        preview: `Just checking in from ${Manager.config.brand.name} — and I've got a little thank-you for you.`,
      },
      content: {
        title: `How's it going?`,
        message: `${greeting},

It's Ian, the founder of **${Manager.config.brand.name}**.

As a thank-you for giving us a try, I'd love to send you a code for a **premium upgrade**.

**Just reply to this email** and I'll get one over to you.

I read every reply and I'm looking forward to hearing from you!`,
      },
      signoff: {
        type: 'personal',
        name: 'Ian Wiedenman, CEO',
        url: 'https://ianwiedenman.com',
        urlText: '@ianwieds',
      },
    },
  })
    .then((result) => {
      assistant.log('sendDiscountNudgeEmail(): Success', result.status);
      return result;
    });
}

/**
 * Send checkup email (7 days after signup)
 */
function sendCheckupEmail(assistant, uid, firstName) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);
  const greeting = firstName ? `Hey ${firstName}` : 'Hi there';

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['account/checkup'],
    subject: `How is your experience with ${Manager.config.brand.name}?`,
    template: 'card',
    copy: false,
    sendAt: moment().add(5, 'days').unix(),
    data: {
      email: {
        preview: `Checking in from ${Manager.config.brand.name} to see how things are going. Let us know if you have any questions or feedback!`,
      },
      content: {
        title: `How's everything going?`,
        message: `${greeting},

It's Ian again from **${Manager.config.brand.name}**. Just checking in to see how things are going for you.

Have you had a chance to explore all our features? Any questions or feedback for us?

We're always here to help, so don't hesitate to reach out. Just reply to this email and we'll get back to you as soon as possible.

Thank you for choosing **${Manager.config.brand.name}**. Here's to new beginnings!`,
      },
      signoff: {
        type: 'personal',
        name: 'Ian Wiedenman, CEO',
        url: 'https://ianwiedenman.com',
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
function sendFeedbackEmail(assistant, uid, firstName) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);
  const first = firstName || 'You';

  return mailer.send({
    to: uid,
    sender: 'hello',
    categories: ['engagement/feedback'],
    subject: `${first} + feedback = Amazon gift card 🎁`,
    template: 'feedback',
    copy: false,
    sendAt: moment().add(10, 'days').unix(),
  })
    .then((result) => {
      assistant.log('sendFeedbackEmail(): Success', result.status);
      return result;
    });
}
