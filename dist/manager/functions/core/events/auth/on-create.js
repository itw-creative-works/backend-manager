const { get, merge } = require('lodash');
const powertools = require('node-powertools');
const fetch = require('wonderful-fetch');
const moment = require('moment');

const MAX_SIGNUPS = 3;
const MAX_AGE = 30;

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.assistant = Manager.Assistant();
  self.libraries = Manager.libraries;
  self.user = payload.user
  self.context = payload.context

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const { admin, functions } = self.libraries;

    // ⛔️⛔️⛔️ This function could be triggered when the user signs up with Google after already having a email/password account

    assistant.log(`Request: ${user.uid}`, user, context);

    // Calculate user age before the poll
    const ageInSeconds = (Date.now() - new Date(user.metadata.creationTime)) / 1000;

    // If user is not new, skip auth-on-create handler
    // This is important to prevent this from running when they link another provider
    if (ageInSeconds >= MAX_AGE) {
      assistant.log(`Skipping because ${user.uid} is NOT NEW (age=${ageInSeconds}):`, existingUser);

      return resolve(self);
    }

    // Check if exists already
    let existingUser;
    await powertools.poll(async () => {
      existingUser = await admin.firestore().doc(`users/${user.uid}`)
        .get()
        .then((doc) => doc.data())
        .catch(e => e);

      assistant.log(`Polling for existing user ${user.uid}...`, existingUser);

      if (existingUser instanceof Error) {
        return false;
      }

      return existingUser;
    }, {interval: 1000, timeout: 30000})
    .catch(e => {
      assistant.error(`Timeout for existing user expired`, e);
    });

    // Log existing user
    assistant.log(`Result of existing user ${user.uid} search (age=${ageInSeconds}):`, existingUser);

    // Build user object
    let userRecord = Manager.User().properties;
    userRecord = merge(userRecord, existingUser, {
      auth: {
        uid: user.uid,
        email: user.email,
      },
    });

    // Fill in location
    // userRecord.personal.location.country = userRecord.activity.geolocation.country;
    // userRecord.personal.location.region = userRecord.activity.geolocation.region;
    // userRecord.personal.location.city = userRecord.activity.geolocation.city;

    const ip = userRecord.activity.geolocation.ip || '';
    const ipKey = ip.replace(/[\.:]/g, '_');

    // Init usage
    const usage = await Manager.Usage().init(assistant, {log: true, key: ip});

    // Check if IP has signed up too many times
    const signups = usage.getUsage('signups');

    // Log the signup
    assistant.log(`Validating signups ${signups}/${MAX_SIGNUPS} for ip ${ip}`, userRecord);

    // Check if the user has signed up too many times
    if (!ip) {
      assistant.log(`Skipping validation because IP was not provided`, ip);
    } else if (signups >= MAX_SIGNUPS) {
      // ⛔️ Important to increment user count before deleting the user because user:delete will decrement the count
      await self.incrementUserCount().catch(e => e);
      await self.deleteUser(userRecord).catch(e => e);
      // Disabled because most users create a fake email which will harm the reputation of the domain
      // await self.sendRateEmail(userRecord).catch(e => e);

      return reject(assistant.errorify(`Too many signups from this IP`, {code: 400}));
    }

    // Set up analytics
    const analytics = Manager.Analytics({
      assistant: assistant,
      uuid: userRecord.auth.uid,
    })

    // Don't save if anonymous
    if (user.providerData.filter(function (item) {
      if (item.providerId !== 'anonymous') {
        analytics.event({
          name: 'sign_up',
          params: {
            method: item.providerId,
          },
        });

        return true
      }
    }).length < 1) {
      return resolve(self);
    }

    // Increment signups
    usage.increment('signups');

    // Update signups
    await usage.update();

    // Increment user count
    await self.incrementUserCount().catch(e => e);

    // Add metadata
    userRecord.metadata = Manager.Metadata().set({tag: 'auth:on-create'});

    // Log
    assistant.log(`main(): User record created ${userRecord.auth.uid}:`, userRecord);

    // Add user record
    await admin.firestore().doc(`users/${userRecord.auth.uid}`)
      .set(userRecord, {merge: true})
      .catch((e) => {
        assistant.error(`Failed save user record`, e);
      })

    // Update referral
    await self.updateReferral(userRecord).catch(e => e);

    // Add to SendGrid list
    // TODO: This should only be done if the user has opted in to marketing
    await self.addToSendGridList(userRecord).catch(e => e);

    // Send welcome emails
    await self.sendWelcomeEmail(userRecord).catch(e => e);
    await self.sendCheckupEmail(userRecord).catch(e => e);
    await self.sendFeedbackEmail(userRecord).catch(e => e);

    return resolve(self);
  });
};

// Delete user
Module.prototype.deleteUser = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Log
    assistant.log(`deleteUser(): Starting...`, user.auth.uid);

    // Delete user
    await fetch(`https://us-central1-${Manager.project.projectId}.cloudfunctions.net/bm_api`, {
      method: 'post',
      timeout: 30000,
      response: 'json',
      log: true,
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        command: 'user:delete',
        payload: {
          uid: user.auth.uid,
        },
      },
    })
    .then((json) => {
      assistant.log(`deleteUser(): Success`, json);

      return resolve(json);
    })
    .catch(e => {
      assistant.error(`deleteUser(): Failed`, e);

      return reject(e);
    })
  });
};

// Increment user count
Module.prototype.incrementUserCount = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const { admin } = self.libraries;

    // Log
    assistant.log(`incrementUserCount(): Starting...`);

    // Increment user count
    await admin.firestore().doc(`meta/stats`)
      .update({
        'users.total': admin.firestore.FieldValue.increment(1),
      })
      .then(() => {
        assistant.log(`incrementUserCount(): Success`);

        return resolve();
      })
      .catch(e => {
        assistant.error(`incrementUserCount(): Failed`, e);

        return reject(e);
      })
  });
};

Module.prototype.sendRateEmail = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Send email
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/sendEmail`, {
      method: 'post',
      response: 'json',
      log: true,
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        app: Manager.config.app.id,
        to: {
          email: user.auth.email,
        },
        categories: [`account/too-many-signups`],
        subject: `Your ${Manager.config.brand.name} account has been deleted [${user.auth.uid}]`,
        template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
        group: 25927,
        copy: true,
        data: {
          email: {
            preview: `You have signed up for too many accounts at ${Manager.config.brand.name}! Your account has been deleted.`,
          },
          body: {
            title: `${Manager.config.brand.name} account deleted`,
            message: `
              Your account at <strong>${Manager.config.brand.name}</strong> has been <strong>deleted</strong> because you have signed up for too many accounts.
              <br>
              <br>
              If you believe this is a mistake, please contact us at ${Manager.config.brand.email}.
              <br>
              <br>
              <strong>User Details</strong>:
              <br>
              <strong>UID</strong>: ${user.auth.uid}
              <br>
              <strong>Email</strong>: ${user.auth.email}
              <br>
            `,
          },
        },
      },
    })
    .then((json) => {
      assistant.log('sendRateEmail(): Success', json);

      return resolve(json);
    })
    .catch((e) => {
      assistant.error('sendRateEmail(): Failed', e);

      return reject(e);
    });
  });
}

Module.prototype.updateReferral = function (user) {
  const self = this;

  return new Promise(function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const { admin } = self.libraries;

    // Log
    assistant.log(`updateReferral(): user`, user.auth.uid, user.affiliate.referrer)

    // Result
    admin.firestore().collection('users')
    .where('affiliate.code', '==', user.affiliate.referrer)
    .get()
    .then(async (snapshot) => {
      if (snapshot.empty) {
        return resolve()
      }
      let count = 0;
      let found = false;
      let error = null;

      for (var i = 0; i < snapshot.size; i++) {
        const doc = snapshot.docs[i];
        if (!found) {
          let data = doc.data() || {};

          let referrals = data.affiliate && data.affiliate.referrals ? data.affiliate.referrals : [];
          referrals = Array.isArray(referrals) ? referrals : [];
          count = referrals.length;
          referrals = referrals.concat({
            uid: user.auth.uid,
            timestamp: assistant.meta.startTime.timestamp,
          })

          // Log
          assistant.log(`updateReferral(): appending referrals...`, doc.ref.id, referrals)

          // Update referrer
          await admin.firestore().doc(`users/${doc.ref.id}`)
          .set({
            affiliate: {
              referrals: referrals,
            }
          }, {merge: true})
         .then(r => {
            assistant.log('updateReferral(): append success');
          })
          .catch(e => {
            assistant.error('updateReferral(): append error', e);
          })
        }
      }

      return resolve();
    })
    .catch(e => {
      return reject(e);
    });
  });
}

Module.prototype.addToSendGridList = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;

    if (!user.auth.email) {
      return reject(new Error('Cannot add user to SendGrid list without email.'))
    }

    // Add to SendGrid list
    fetch('https://api.itwcreativeworks.com/wrapper', {
      method: 'post',
      response: 'json',
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        service: 'sendgrid',
        command: `v3/marketing/contacts`,
        method: `put`,
        supplemental: {
          app: Manager.config.app.id,
          source: 'backend-manager:auth:on-create',
          user: user,
        }
      },
    })
    .then((r) => {
      assistant.log('addToSendGridList(): Success', r)
      return resolve(r);
    })
    .catch((e) => {
      assistant.error('addToSendGridList(): Failed', e)
      return reject(e);
    })
  });
}

Module.prototype.sendWelcomeEmail = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Send email
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/sendEmail`, {
      method: 'post',
      response: 'json',
      log: true,
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        app: Manager.config.app.id,
        to: {
          email: user.auth.email,
        },
        categories: [`account/welcome`],
        subject: `Welcome to ${Manager.config.brand.name}!`,
        template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
        group: 25928,
        copy: false,
        sendAt: moment().add(1, 'hour').unix(),
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
              Feel free to reply directly to this email with any questions you may have.
              Our team and I are dedicated to ensuring your experience is exceptional.
              <br><br>
              Thank you for choosing <strong>${Manager.config.brand.name}</strong>. Here's to new beginnings!
            `
          },
          signoff: {
            type: 'personal',
            image: undefined,
            name: 'Ian Wiedenman, CEO',
            url: `https://ianwiedenman.com?utm_source=welcome-email&utm_medium=email&utm_campaign=${Manager.config.app.id}`,
            urlText: '@ianwieds',
          },
        },
      },
    })
    .then((json) => {
      assistant.log('sendWelcomeEmail(): Success', json)
      return resolve(json);
    })
    .catch((e) => {
      assistant.error('sendWelcomeEmail(): Failed', e)
      return reject(e);
    });
  });
}

Module.prototype.sendCheckupEmail = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Send email
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/sendEmail`, {
      method: 'post',
      response: 'json',
      log: true,
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        app: Manager.config.app.id,
        to: {
          email: user.auth.email,
        },
        categories: [`account/checkup`],
        subject: `How's your experience with ${Manager.config.brand.name}?`,
        template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
        group: 25928,
        copy: false,
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
            `
          },
          signoff: {
            type: 'personal',
            image: undefined,
            name: 'Ian Wiedenman, CEO',
            url: `https://ianwiedenman.com?utm_source=checkup-email&utm_medium=email&utm_campaign=${Manager.config.app.id}`,
            urlText: '@ianwieds',
          },
        },
      },
    })
    .then((json) => {
      assistant.log('sendCheckupEmail(): Success', json)
      return resolve(json);
    })
    .catch((e) => {
      assistant.error('sendCheckupEmail(): Failed', e)
      return reject(e);
    });
  });
}

Module.prototype.sendFeedbackEmail = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Send email
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/sendEmail`, {
      method: 'post',
      response: 'json',
      log: true,
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        app: Manager.config.app.id,
        to: {
          email: user.auth.email,
        },
        categories: [`engagement/feedback`],
        subject: `Want to share your feedback about ${Manager.config.brand.name}?`,
        template: 'd-c1522214c67b47058669acc5a81ed663',
        group: 25928,
        copy: false,
        sendAt: moment().add(14, 'days').unix(),
      },
    })
    .then((json) => {
      assistant.log('sendFeedbackEmail(): Success', json)
      return resolve(json);
    })
    .catch((e) => {
      assistant.error('sendFeedbackEmail(): Failed', e)
      return reject(e);
    });
  });
}

module.exports = Module;
