const _ = require('lodash')
const fetch = require('node-fetch');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    self.Api.resolveUser({adminRequired: true})
    .then(async (user) => {
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
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    const result = {
      signedUp: false,
      referrerUid: undefined,
      // updatedReferral: true,
    };

    payload = payload || {};    

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
      payload.affiliate.referrer = undefined;
      console.error('Failed to update affiliate code', e)
    })

    // Merge the payload and the default user object
    const user = {
      activity: {
        geolocation: {
          // Main geolocation
          ip: assistant.request.ip,
          continent: assistant.request.continent,
          country: assistant.request.country,
          city: assistant.request.city,
          latitude: assistant.request.latitude,
          longitude: assistant.request.longitude,

          // Get User Agent data
          userAgent: assistant.request.userAgent,
          language: assistant.request.language,
          platform: assistant.request.platform,
        },
      },
      affiliate: {
        referrer: payload.affiliate.referrer,
      },
      metadata: Manager.Metadata().set({tag: 'user:sign-up'}),
    }
    
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
  const result = {
    count: 0,
    updatedReferral: false,
    referrerUid: undefined,
  }
  payload = payload || {};

  return new Promise(function(resolve, reject) {
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

          await self.libraries.admin.firestore().doc(`users/${doc.id}`)
          .set({
            affiliate: {
              referrals: referrals
            }
          }, {merge: true})
          .catch(e => {
            console.error('Error updating referral', e);
            error = e;
          })

          result.count = count;
          result.updatedReferral = true;
          result.referrerUid = doc.id
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
