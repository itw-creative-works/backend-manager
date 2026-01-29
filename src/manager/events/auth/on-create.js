const fetch = require('wonderful-fetch');
const moment = require('moment');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * onCreate - Create user doc + increment count
 *
 * This function fires for ALL user creations (including Admin SDK).
 * It creates the user doc and increments the user count in an atomic batch write.
 *
 * Key behaviors:
 * - Checks if user doc already exists (auth.uid) → skips if exists (handles test accounts, provider linking)
 * - Batch writes user doc + increment count atomically
 * - Retries up to 3 times with exponential backoff on failure
 * - Sends analytics event (non-critical, no retry)
 */
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  const startTime = Date.now();
  const { admin } = libraries;

  assistant.log(`onCreate: ${user.uid}`, { email: user.email });

  // Skip anonymous users
  if (user.providerData?.every(p => p.providerId === 'anonymous')) {
    assistant.log(`onCreate: Skipping anonymous user ${user.uid} (${Date.now() - startTime}ms)`);
    return;
  }

  // Check if user doc already exists (handles test accounts, provider linking)
  const existingDoc = await admin.firestore().doc(`users/${user.uid}`)
    .get()
    .catch(e => {
      assistant.error(`onCreate: Failed to check existing doc for ${user.uid}:`, e);
      return null;
    });

  if (existingDoc?.exists && existingDoc.data()?.auth?.uid) {
    assistant.log(`onCreate: User doc already exists for ${user.uid}, skipping creation (${Date.now() - startTime}ms)`);
    return;
  }

  // Create user record using Manager.User() helper
  const userRecord = Manager.User({
    auth: {
      uid: user.uid,
      email: user.email,
    },
  }).properties;

  // Add metadata
  userRecord.metadata = Manager.Metadata().set({ tag: 'auth:on-create' });

  assistant.log(`onCreate: Creating user doc for ${user.uid}`, userRecord);

  // Batch write with retry: create user doc + increment count
  try {
    await retryBatchWrite(assistant, async () => {
      const batch = admin.firestore().batch();

      // Create user doc
      batch.set(admin.firestore().doc(`users/${user.uid}`), userRecord);

      // Increment user count
      batch.update(admin.firestore().doc('meta/stats'), {
        'users.total': admin.firestore.FieldValue.increment(1),
      });

      await batch.commit();
    }, MAX_RETRIES, RETRY_DELAY_MS);

    assistant.log(`onCreate: Successfully created user doc for ${user.uid}`);
  } catch (error) {
    assistant.error(`onCreate: Failed to create user doc after ${MAX_RETRIES} retries:`, error);

    // Don't reject - the user was already created in Auth
    // The user:sign-up endpoint will handle creating the doc if it's missing
    return;
  }

  // Send emails in dev/production, or in test mode if TEST_EXTENDED_MODE=true
  // Note: Must be passed to the emulator
  const shouldSendEmails = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;

  if (!shouldSendEmails) {
    assistant.log(`onCreate: Skipping emails/SendGrid (BEM_TESTING=true, TEST_EXTENDED_MODE not set)`);
  } else {
    assistant.log(`onCreate: Sending emails/adding to SendGrid for ${user.uid}`);

    // Add to marketing lists (SendGrid + Beehiiv) via centralized endpoint
    fetch(`${Manager.project.apiUrl}/backend-manager/marketing/contact`, {
      method: 'POST',
      response: 'json',
      body: {
        backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        email: user.email,
        source: 'auth:on-create',
      },
    }).catch(e => assistant.error('onCreate: add-marketing-contact failed:', e));

    // Send welcome emails (non-blocking, don't fail on error)
    sendWelcomeEmail(Manager, assistant, user).catch(e => assistant.error('onCreate: sendWelcomeEmail failed:', e));
    sendCheckupEmail(Manager, assistant, user).catch(e => assistant.error('onCreate: sendCheckupEmail failed:', e));
    sendFeedbackEmail(Manager, assistant, user).catch(e => assistant.error('onCreate: sendFeedbackEmail failed:', e));
  }

  assistant.log(`onCreate: Completed for ${user.uid} (${Date.now() - startTime}ms)`);
};

/**
 * Retry a function up to maxRetries times with exponential backoff
 */
async function retryBatchWrite(assistant, fn, maxRetries, delayMs) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error;
      assistant.error(`onCreate: Batch write attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        assistant.log(`onCreate: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}

/**
 * Send welcome email (immediate)
 */
function sendWelcomeEmail(Manager, assistant, user) {
  return fetch(`${Manager.project.apiUrl}/backend-manager/admin/email`, {
    method: 'POST',
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      to: [{ email: user.email }],
      categories: ['account/welcome'],
      subject: `Welcome to ${Manager.config.brand.name}!`,
      template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
      group: 25928,
      copy: false,
      ensureUnique: true,
      data: {
        email: {
          preview: `Welcome aboard! I'm Ian, the CEO and founder of ${Manager.config.brand.name}. I'm here to ensure your journey with us gets off to a great start.`,
        },
        body: {
          title: `Welcome to ${Manager.config.brand.name}!`,
          message: `
            Welcome aboard!
            <br><br>
            I'm Ian, the founder and CEO of <strong>${Manager.config.brand.name}</strong>, and I'm thrilled to have you with us.
            Your journey begins today, and we are committed to supporting you every step of the way.
            <br><br>
            We are dedicated to ensuring your experience is exceptional.
            Feel free to reply directly to this email with any questions you may have.
            <br><br>
            Thank you for choosing <strong>${Manager.config.brand.name}</strong>. Here's to new beginnings!
          `,
        },
        signoff: {
          type: 'personal',
          name: 'Ian Wiedenman, CEO',
          url: `https://ianwiedenman.com?utm_source=welcome-email&utm_medium=email&utm_campaign=${Manager.config.app.id}`,
          urlText: '@ianwieds',
        },
      },
    },
  })
  .then((json) => {
    assistant.log('sendWelcomeEmail(): Success', json);
    return json;
  });
}

/**
 * Send checkup email (7 days after signup)
 */
function sendCheckupEmail(Manager, assistant, user) {
  return fetch(`${Manager.project.apiUrl}/backend-manager/admin/email`, {
    method: 'POST',
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      to: [{ email: user.email }],
      categories: ['account/checkup'],
      subject: `How's your experience with ${Manager.config.brand.name}?`,
      template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
      group: 25928,
      copy: false,
      ensureUnique: true,
      sendAt: moment().add(7, 'days').unix(),
      data: {
        email: {
          preview: `Checking in from ${Manager.config.brand.name} to see how things are going. Let us know if you have any questions or feedback!`,
        },
        body: {
          title: `How's everything going?`,
          message: `
            Hi there,
            <br><br>
            It's Ian again from <strong>${Manager.config.brand.name}</strong>. Just checking in to see how things are going for you.
            <br><br>
            Have you had a chance to explore all our features? Any questions or feedback for us?
            <br><br>
            We're always here to help, so don't hesitate to reach out. Just reply to this email and we'll get back to you as soon as possible.
            <br><br>
            Thank you for choosing <strong>${Manager.config.brand.name}</strong>. Here's to new beginnings!
          `,
        },
        signoff: {
          type: 'personal',
          name: 'Ian Wiedenman, CEO',
          url: `https://ianwiedenman.com?utm_source=checkup-email&utm_medium=email&utm_campaign=${Manager.config.app.id}`,
          urlText: '@ianwieds',
        },
      },
    },
  })
  .then((json) => {
    assistant.log('sendCheckupEmail(): Success', json);
    return json;
  });
}

/**
 * Send feedback email (14 days after signup)
 */
function sendFeedbackEmail(Manager, assistant, user) {
  return fetch(`${Manager.project.apiUrl}/backend-manager/admin/email`, {
    method: 'POST',
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      to: [{ email: user.email }],
      categories: ['engagement/feedback'],
      subject: `Want to share your feedback about ${Manager.config.brand.name}?`,
      template: 'd-c1522214c67b47058669acc5a81ed663',
      group: 25928,
      copy: false,
      ensureUnique: true,
      sendAt: moment().add(14, 'days').unix(),
    },
  })
  .then((json) => {
    assistant.log('sendFeedbackEmail(): Success', json);
    return json;
  });
}
