let fetch;
const _ = require('lodash');

let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant({req: data.req, res: data.res})
    this.req = data.req;
    this.res = data.res;

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;

    let response = {
      status: 200,
      data: {},
    };


    return libraries.cors(req, res, async () => {
      let user = await assistant.authenticate();

      if (!user.authenticated) {
        response.status = 401;
        response.error = new Error('Account does not exist in Auth.');
      } else {
        await self.signUp({
          auth: {
            uid: user.auth.uid,
            email: user.auth.email,
          },
          affiliate: {
            referredBy: assistant.request.data.affiliateCode
          },
        })
        .then(async function (result) {
          response.data = result;
          if (assistant.request.data.newsletterSignUp) {
            await addToMCList(
              _.get(self.Manager.config, 'mailchimp.key'),
              _.get(self.Manager.config, 'mailchimp.list_id'),
              user.auth.email,
            )
            .then(function (res) {
              assistant.log('Sucessfully added user to MC list.')
            })
            .catch(function (error) {
              assistant.log('Failed to add user to MC list.', error)
            })
          }
        })
        .catch(function (e) {
          response.status = 400;
          response.error = e;
          assistant.error('Failed to signup:', response.error);
        })
      }

      assistant.log('Signup handler:', assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        assistant.error('Failed to signup:', assistant.request.data, user);
        return res.status(response.status).send(response.error.message);
      }
    });
  },
  signUp: async function (payload) {
    let self = this;
    let response = {};
    let error;
    payload = payload || {};

    return new Promise(async function(resolve, reject) {
      let existingUser = {};
      let finalPayload = {};
      let user = self.Manager.User(payload);

      if (!_.get(payload, 'auth.uid', null) || !_.get(payload, 'auth.email', null)) {
        return reject(new Error('Cannot create user without UID and email.'))
      }

      await self.libraries.admin.firestore().doc(`users/${payload.auth.uid}`)
      .get()
      .then(async function (doc) {
        existingUser = doc.data() || {};
      })
      .catch(function (e) {
        error = e;
      })

      if (error) {
        return reject(error);
      }

      // Merge the payload and the default user object
      finalPayload = _.merge({}, existingUser, user.properties)

      self.updateReferral({
        affiliateCode: _.get(payload, 'affiliate.referredBy', null),
        uid: payload.auth.uid,
      })
      .catch(function (e) {
        assistant.log('Failed to update affiliate code')
      })

      self.libraries.admin.firestore().doc(`users/${payload.auth.uid}`)
      .set(finalPayload, { merge: true })
      .then(function(data) {
        response.status = 200;
        response.data = {created: true};
        return resolve(response);
      })
      .catch(function(error) {
        return reject(error);
      })

    });
  },
  updateReferral: async function (payload) {
    let self = this;
    payload = payload || {};

    let response = {};

    return new Promise(function(resolve, reject) {
      self.libraries.admin.firestore().collection('users')
      .where('affiliate.code', '==', payload.affiliateCode)
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          response.status = 200;
          response.referrals = 0;
          return resolve()
        }
        let count = 0;
        snapshot.forEach(doc => {
          let data = doc.data() || {};
          let referrals = data.affiliate && data.affiliate.referrals ? data.affiliate.referrals : [];
          referrals = Array.isArray(referrals) ? referrals : [];
          count = referrals.length;
          referrals = referrals.concat({
            uid: payload.uid,
            timestamp: self.assistant.meta.startTime.timestamp,
          })

          self.libraries.admin.firestore().doc(`users/${doc.id}`)
          .set({
            affiliate: {
              referrals: referrals
            }
          }, {merge: true})
        });
        response.status = 200;
        response.referrals = count;
        return resolve()
      })
      .catch(err => {
        response.status = 500;
        response.error = err;
        return reject(response);
      });
    });
  }
}
module.exports = Module;

// HELPERS //
function addToMCList(key, listId, email) {
  return new Promise((resolve, reject) => {
    let datacenter = key.split('-')[1];
    fetch = fetch || require('node-fetch');
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
