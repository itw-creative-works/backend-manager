const _ = require('lodash')
const fetch = require('wonderful-fetch');
const moment = require('moment');

const MAX_SIGNUPS = 3;
const MAX_AGE = 30;

function Module() {

}

Module.prototype.main = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;
    const payload = self.payload;

    Api.resolveUser({adminRequired: true})
    .then(async (user) => {
        // ⛔️⛔️⛔️ This function could be triggered when the user signs up with Google after already having a email/password account
        // Get auth user from firebase
        const ip = assistant.request.geolocation.ip;
        const authUser = await Manager.libraries.admin.auth().getUser(user.auth.uid).catch(e => e);
        const usage = await Manager.Usage().init(assistant, {log: true, key: ip});

        if (authUser instanceof Error) {
          return reject(assistant.errorify(`Failed to get auth user: ${authUser}`, {code: 500, sentry: false, send: false, log: false}));
        }

        // Age in seconds
        const ageInSeconds = (Date.now() - new Date(authUser.metadata.creationTime)) / 1000;

        // If the user is not new, reject
        if (ageInSeconds >= MAX_AGE) {
          return reject(assistant.errorify(`User is not new.`, {code: 400, sentry: false, send: false, log: false}));
        }

        // Check if IP has signed up too many times
        const signups = usage.getUsage('signups');

        // Log the signup
        assistant.log(`Validating signups ${signups}/${MAX_SIGNUPS} for ip ${ip}`, user);

        // If over limit, reject and delete the user
        if (signups >= MAX_SIGNUPS) {
          await Api.import('user:delete')
            .then(async (lib) => {
              await lib.main().catch(e => e);
            })

          await self.sendRateEmail(user).catch(e => e);

          // Reject
          return reject(assistant.errorify(`Too many signups from this IP (${ip}).`, {code: 429, sentry: false, send: false, log: false}));
        }

        // Increment signups
        usage.increment('signups');

        // Update signups
        await usage.update();

        // Send welcome email
        await self.sendWelcomeEmail(user).catch(e => e);
        await self.sendCheckupEmail(user).catch(e => e);
        await self.sendFeedbackEmail(user).catch(e => e);

        await self.signUp({
          auth: {
            uid: user?.auth?.uid,
            email: user?.auth?.email,
          },
          affiliate: {
            referrer: payload?.data?.payload?.affiliateCode || null,
          },
        })
        .then(async function (result) {
          // Skip if not a newsletter sign up
          if (!payload?.data?.payload?.newsletterSignUp) {
            return resolve({data: result});
          }

          // Add to SendGrid list
          await self.addToSendGridList(user)
          .then((r) => {
            assistant.log('addToSendGridList(): Success', r)
          })
          .catch((e) => {
            assistant.log('Failed to add user to MC list.', e)
          })

          // Resolve
          return resolve({data: result});
        })
        .catch((e) => {
          return reject(assistant.errorify(`Failed to sign up: ${e}`, {code: 500, sentry: false, send: false, log: false}));
        })
    })
    .catch((e) => {
      return reject(e);
    })

  });

};

Module.prototype.signUp = function (payload) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;

    const result = {
      signedUp: false,
      referrerUid: null,
      // updatedReferral: true,
    };

    payload = payload || {};

    assistant.log(`signUp(): payload`, payload)

    // Check if the user has a UID and email
    if (!payload?.auth?.uid || !payload?.auth?.email) {
      return reject(new Error('Cannot create user without UID and email.'))
    }

    // Update the user who referred this user
    await self.updateReferral({
      affiliateCode: _.get(payload, 'affiliate.referrer', null),
      uid: payload.auth.uid,
    })
    .then((r) => {
      payload.affiliate.referrer = r.referrerUid;
      result.referrerUid = payload.affiliate.referrer;
    })
    .catch((e) => {
      payload.affiliate.referrer = null;

      assistant.error('Failed to update affiliate code', e)
    })

    // Merge the payload and the default user object
    const user = {
      activity: {
        geolocation: assistant.request.geolocation,
        client: assistant.request.client,
      },
      affiliate: {
        referrer: payload.affiliate.referrer,
      },
      metadata: Manager.Metadata().set({tag: 'user:sign-up'}),
    }

    assistant.log(`signUp(): user`, user);

    // Set the user
    self.libraries.admin.firestore().doc(`users/${payload.auth.uid}`)
    .set(user, { merge: true })
    .then((data) => {
      result.signedUp = true;

      return resolve(result);
    })
    .catch((e) => {
      return reject(e);
    })

  });
},

Module.prototype.updateReferral = function (payload) {
  const self = this;

  return new Promise(function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;

    const result = {
      count: 0,
      updatedReferral: false,
      referrerUid: null,
    }
    payload = payload || {};

    assistant.log(`updateReferral(): payload`, payload)

    self.libraries.admin.firestore().collection('users')
    .where('affiliate.code', '==', payload.affiliateCode)
    .get()
    .then(async (snapshot) => {
      if (snapshot.empty) {
        return resolve(result)
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
            uid: payload.uid,
            timestamp: self.assistant.meta.startTime.timestamp,
          })

          assistant.log(`updateReferral(): appending referrals...`, doc.ref.id, referrals)

          await self.libraries.admin.firestore().doc(`users/${doc.ref.id}`)
          .set({
            affiliate: {
              referrals: referrals,
            }
          }, {merge: true})
          .catch(e => {
            self.assistant.error('Error updating referral', e);

            error = e;
          })

          result.count = count;
          result.updatedReferral = true;
          result.referrerUid = doc.ref.id;
          found = true
        }
      }
      if (error) {
        return reject(error);
      }
      return resolve(result)
    })
    .catch(e => {
      return reject(e);
    });
  });
}

// addToSendGridList
Module.prototype.addToSendGridList = function (user) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;

    if (!user?.auth?.email) {
      return reject(new Error('Cannot add user to SendGrid list without email.'))
    }

    // Add to SendGrid list
    fetch('https://api.itwcreativeworks.com/wrapper', {
      method: 'post',
      response: 'json',
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        service: 'sendgrid',
        command: `/v3/marketing/contacts`,
        method: `put`,
        body: {
          contacts: [
            {
              email: user?.auth?.email,
              address_line_1: undefined,
              address_line_2: undefined,
              // alternate_emails: [],
              city: user?.activity?.geolocation?.city,
              country: user?.activity?.geolocation?.country,
              first_name: undefined,
              last_name: undefined,
              postal_code: undefined,
              state_province_region: user?.activity?.geolocation?.region,

              custom_fields: {
                app: Manager.config.app.id,
                user: user?.auth?.uid,
              },
            },
          ],
        },
      },
    })
    .then(function (res) {
      assistant.log('Sucessfully added user to SendGrid list.')
      return resolve(res);
    })
    .catch(function (e) {
      assistant.log('Failed to add user to SendGrid list.', e)
      return resolve(e);
    })

    // await self.libraries.sendgrid.request({
    //   method: 'post',
    //   url: `/v3/contactdb/recipients`,
    //   body: [{
    //     email: email,
    //   }],
    // })
    // .then(function (res) {
    //   assistant.log('Sucessfully added user to SendGrid list.')
    //   return resolve(res);
    // })
    // .catch(function (e) {
    //   assistant.log('Failed to add user to SendGrid list.', e)
    //   return resolve(e);
    // })
  });
}

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
        subject: `Your ${Manager.config.brand.name} account has been deleted`,
        template: 'd-b7f8da3c98ad49a2ad1e187f3a67b546',
        group: 25927,
        data: {
          email: {
            preview: `You have signed up for too many accounts at ${Manager.config.brand.name}! Your account has been deleted.`,
          },
          body: {
            title: `Account deleted`,
            message: `
              Your account at <strong>${Manager.config.brand.name}</strong> has been <strong>deleted</strong> because you have signed up for too many accounts.
              <br>
              <br>
              If you believe this is a mistake, please contact us at ${Manager.config.brand.email}.
              <br>
              <br>
              <strong>User Record</strong>:
              <br>
              <pre><code>${JSON.stringify(user, null, 2)}</code></pre>
            `,
          },
        },
      },
    })
    .then(async (json) => {
      assistant.log('sendEmail(): Success', json)
      return resolve(json);
    })
    .catch(e => {
      assistant.error('sendEmail(): Failed', e)
      return resolve(e);
    });
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
        sendAt: moment().add(1, 'day').unix(),
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
    .then(async (json) => {
      assistant.log('sendEmail(): Success', json)
      return resolve(json);
    })
    .catch(e => {
      assistant.error('sendEmail(): Failed', e)
      return resolve(e);
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
    .then(async (json) => {
      assistant.log('sendEmail(): Success', json)
      return resolve(json);
    })
    .catch(e => {
      assistant.error('sendEmail(): Failed', e)
      return resolve(e);
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
    .then(async (json) => {
      assistant.log('sendEmail(): Success', json)
      return resolve(json);
    })
    .catch(e => {
      assistant.error('sendEmail(): Failed', e)
      return resolve(e);
    });
  });
}

module.exports = Module;
