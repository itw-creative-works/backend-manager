let uuid4;
let shortid;
let Mailchimp;

let Module = {
  init: async function (data) {
    this.ref = data.ref;
    this.req = data.req;
    this.res = data.res
    this.assistant = new this.ref.BackendAssistant().init({
      ref: {
        req: data.req,
        res: data.res,
        admin: data.ref.admin,
        functions: data.ref.functions,
      },
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    let This = this;

    return ref.cors(req, res, async () => {
      // let assistant = new ref.BackendAssistant();
      // assistant.init({
      //   ref: {
      //     req: req,
      //     res: res,
      //     admin: ref.admin,
      //     functions: ref.functions,
      //   },
      //   accept: 'json',
      // })

      let response = {
        status: 200,
      };

      let user = ref.admin.firestore().doc(`users/${assistant.request.data.uid}`);

      await user
      .get()
      .then(async function (doc) {
        if (doc.exists) {
          response.status = 500;
          response.error = "Already exists.";
        } else if (!assistant.request.data.uid || !assistant.request.data.email) {
          response.status = 500;
          response.error = "Missing data.";
        } else {
          await Module.signUp({
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
            uid: assistant.request.data.uid,
            email: assistant.request.data.email,
            affiliateCode: assistant.request.data.affiliateCode,
          })
          .then(async function (result) {
            console.log('succ 1', result);
            response = result;
            await addToMCList(This.ref.functions.config().mailchimp.key, This.ref.functions.config().mailchimp.list_id, assistant.request.data.email)
            .then(function () {
              assistant.log('Sucessfully added user to MC list.')
            })
            .catch(function (error) {
              assistant.log('Failed to add user to MC list.', error)
            })
          })
          .catch(function (result) {
            console.log('error 2', result);
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
    let This = this;
    payload = payload || {};

    let response = {};
    uuid4 = uuid4 || require('uuid/v4');
    shortid = shortid || require('shortid');
    return new Promise(function(resolve, reject) {

      This.ref.admin.firestore().doc(`users/${payload.uid}`)
      .set(
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
        },
        {
          merge: true
        }
      )
      .then(function(data) {
        response.status = 200;
        response.data = {created: true};
        resolve(response);
      })
      .catch(function(error) {
        response.status = 500;
        response.error = error;
        reject(response);
      })
    });
  }
}
module.exports = Module;

// HELPERS //

function addToMCList(key, listId, email) {
  return new Promise((resolve, reject) => {
    let request = require('request');
    request.post(
      {
        url: `https://us16.api.mailchimp.com/3.0/lists/${listId}/members`,
        body: {
          email_address: 'ian.wiedenman@gmail.com', status: "subscribed"
        },
        timeout: 10000,
        json: true,
        headers: {
          'Authorization': `Basic ${key}`
        },
      },
      function (err, httpResponse, body) {
        if (err) {
          reject(err);
        } else {
          resolve(body);
        }
      }
    );
  });
}
