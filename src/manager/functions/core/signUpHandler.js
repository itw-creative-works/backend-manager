let uuid4;
let shortid;
let Mailchimp;
let fetch;

let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant({req: data.req, res: data.res})

    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let libraries = this.libraries;
    let assistant = this.assistant;
    let self = this;

    return libraries.cors(req, res, async () => {
      let response = {
        status: 200,
      };


      let user = libraries.admin.firestore().doc(`users/${assistant.request.data.uid}`);
      let accountExists = false;
      await libraries.admin.auth().getUser(assistant.request.data.uid)
        .then(function(userRecord) {
          accountExists = true;
        })
        .catch(function(error) {
          accountExists = false;
        });

      // self.updateReferral({
      //   affiliateCode: assistant.request.data.affiliateCode,
      //   uid: assistant.request.data.uid,
      // })

      // assistant.log('TEST');
      await user
      .get()
      .then(async function (doc) {
        if (doc.exists) {
          response.status = 500;
          response.error = "Account already exists in Firestore.";
        } else if (!assistant.request.data.uid || !assistant.request.data.email) {
          response.status = 500;
          response.error = "Missing data. UID and email required.";
        } else if (!accountExists) {
          response.status = 500;
          response.error = "Account does not exist in Auth.";
        } else {
          await Module.signUp({
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
            uid: assistant.request.data.uid,
            email: assistant.request.data.email,
            affiliateCode: assistant.request.data.affiliateCode,
          })
          .then(async function (result) {
            // console.log('succ 1', result);
            response = result;
            if (assistant.request.data.newsletterSignUp) {
              await addToMCList(
                self.libraries.functions.config().mailchimp.key,
                self.libraries.functions.config().mailchimp.list_id,
                assistant.request.data.email
              )
              .then(function (res) {
                assistant.log('Sucessfully added user to MC list.')
              })
              .catch(function (error) {
                assistant.log('Failed to add user to MC list.', error)
              })
            }
          })
          .catch(function (result) {
            // console.log('error 2', result);
            response.status = 500;
            response.error = result;
          })
        }
      })

      assistant.log(assistant.request.data, response);

      return res.status(response.status).json(response);
    });
  },
  signUp: async function (payload) {
    let self = this;
    payload = payload || {};
    payload.roles = payload.roles || {};


    let response = {};
    uuid4 = uuid4 || require('uuid').v4;
    shortid = shortid || require('shortid');
    return new Promise(function(resolve, reject) {

      let finalPayload =
      {
        // MAKEITFAIL: undefined,
        activity: {
          lastActivity: {
            timestamp: payload.timestamp || '',
            timestampUNIX: payload.timestampUNIX || 0,
          },
          created: {
            timestamp: payload.timestamp || '',
            timestampUNIX: payload.timestampUNIX || 0,
          }
        },
        firebase: {
          uid: payload.uid,
          email: payload.email,
        },
        roles: {},
        plan: {},
        affiliate: {
          code: shortid.generate(),
          referrals: {
            // TIMESTAMPS for referrals as KEYS
          },
          referredBy: payload.affiliateCode || '',
        },
        api: {
          privateKey: `api_${uuid4()}`,
          // publicKey: '', // Not stored here. Should be firebase email or firebase UID
        },
      }
      if (payload.roles.admin) {
        finalPayload.roles.admin = true
      }

      self.updateReferral({
        affiliateCode: payload.affiliateCode,
        uid: payload.uid,
      })
      .catch(function (e) {
        assistant.log('Failed to update affiliate code', payload.affiliateCode)
      })

      self.libraries.admin.firestore().doc(`users/${payload.uid}`)
      .set(finalPayload,
        {
          merge: true
        }
      )
      .then(function(data) {
        response.status = 200;
        response.data = {created: true};
        return resolve(response);
      })
      .catch(function(error) {
        response.status = 500;
        response.error = error;
        return reject(response);
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
