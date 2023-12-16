const _ = require('lodash')
const fetch = require('node-fetch');

const MAX_SIGNUPS = 3;
const MAX_AGE = 30;

function Module() {

}

Module.prototype.main = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const Api = self.Api;
    const assistant = self.assistant;
    const payload = self.payload;

    Api.resolveUser({adminRequired: true})
    .then(async (user) => {
        // ⛔️⛔️⛔️ This function could be triggered when the user signs up with Google after already having a email/password account
        // Get auth user from firebase
        const ip = assistant.request.geolocation.ip;
        const authUser = await Manager.libraries.admin.auth().getUser(user.auth.uid).catch(e => e);
        const usage = await Manager.Usage().init(assistant, {log: true, localKey: ip});

        if (authUser instanceof Error) {
          return reject(assistant.errorManager(`Failed to get auth user: ${authUser}`, {code: 500, sentry: false, send: false, log: false}).error)
        }

        // Age in seconds
        const ageInSeconds = (Date.now() - new Date(authUser.metadata.creationTime)) / 1000;

        // If the user is not new, reject
        if (ageInSeconds >= MAX_AGE) {
          return reject(assistant.errorManager(`User is not new.`, {code: 400, sentry: false, send: false, log: false}).error)
        }

        // Check if IP has signed up too many times
        const signups = usage.getUsage('signups');

        // Log the signup
        usage.log(`Validating signups ${signups}/${MAX_SIGNUPS}`,);

        // If over limit, reject and delete the user
        if (signups >= MAX_SIGNUPS) {
          await Api.import('user:delete')
            .then(async (lib) => {
              await lib.main().catch(e => e);
            })
          return reject(assistant.errorManager(`Too many signups from this IP (${ip}).`, {code: 429, sentry: false, send: false, log: false}).error)
        }

        // Increment signups
        usage.increment('signups');

        await self.signUp({
          auth: {
            uid: _.get(user, 'auth.uid', null),
            email: _.get(user, 'auth.email', null),
          },
          affiliate: {
            referrer: _.get(payload.data.payload, 'affiliateCode', null),
          },
        })
        .then(async function (result) {
          if (_.get(payload.data.payload, 'newsletterSignUp', false)) {
            await addToMCList(
              _.get(Manager.config, 'mailchimp.key'),
              _.get(Manager.config, 'mailchimp.list_id'),
              _.get(user, 'auth.email', null),
            )
            .then(function (res) {
              assistant.log('Sucessfully added user to MC list.')
            })
            .catch(function (e) {
              assistant.log('Failed to add user to MC list.', e)
            })
          }
          return resolve({data: result});
        })
        .catch(function (e) {
          return reject(assistant.errorManager(`Failed to sign up: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
        })
    })
    .catch(e => {
      return reject(e);
    })

  });

};

Module.prototype.signUp = function (payload) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const Api = self.Api;
    const assistant = self.assistant;

    const result = {
      signedUp: false,
      referrerUid: null,
      // updatedReferral: true,
    };

    payload = payload || {};

    assistant.log(`signUp(): payload`, payload)

    // Check if the user has a UID and email
    if (!_.get(payload, 'auth.uid', null) || !_.get(payload, 'auth.email', null)) {
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

    assistant.log(`signUp(): user`, user)

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
    const Api = self.Api;
    const assistant = self.assistant;

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

function addToMCList(key, listId, email) {
  return new Promise((resolve, reject) => {
    let datacenter = key.split('-')[1];
    fetch(`https://${datacenter}.api.mailchimp.com/3.0/lists/${listId}/members`, {
        method: 'post',
        body: JSON.stringify({
          email_address: email,
          status: 'subscribed',
        }),
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${key}`,
        },
      })
      .then(res => res.json())
      .then(json => {
        if (json.status !== 'subscribed') {
          return reject(new Error(json.status));
        }
        return resolve(json);
      })
      .catch(e => {
        return reject(e);
      })

  });
}


module.exports = Module;
