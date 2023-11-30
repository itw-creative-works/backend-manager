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

      const command = assistant.request.data.command;
      const payload = {
        response: response,
        data: assistant.request.data,
        user: user,
      }

      self.assistant.log('Executing', command)

      function _errorLog(e) {
        self.assistant.error(e)
      }

      // Actions
      // General
      if (command === 'general:payment-processor' || command === 'payment-processor') { // rename: general:payment-processor
        await self.general_paymentProcessor(payload).catch(e => _errorLog);
      // } else if (command === 'general:generate-uuid') {
      //   await self.general_generateUUID(payload).catch(e => _errorLog);

      // User
      } if (command === 'user:create-custom-token' || command === 'create-custom-token') { // rename: user:create-custom-token
        await self.user_createCustomToken(payload).catch(e => _errorLog);
      } else if (command === 'user:delete' || command === 'delete-user') { // rename: user:delete
        await self.user_delete(payload).catch(e => _errorLog);
      } else if (command === 'user:sign-out-all-sessions' || command === 'sign-out-all-sessions') { // rename: user:sign-out-all-sessions
        await self.user_signOutAllSessions(payload).catch(e => _errorLog);
      } else if (command === 'user:get-subscription-info' || command === 'get-user-subscription-info') {  // rename: user:get-subscription-info
        await self.user_getSubscriptionInfo(payload).catch(e => _errorLog);
      // } else if (command === 'user:sign-up') {
      //   await self.user_signUp(payload).catch(e => _errorLog);

      // Handler
      } else if (command === 'handler:create-post') {
        console.log('---------AAAAA');
        await self.handler_createPost().init(payload).main().catch(e => _errorLog);
        console.log('---------BBBBB');
        await self.handler_createPost().init(payload).main().catch(e => _errorLog);

      // Admin
      // } else if (command === 'admin:create-post') {
      //   await self.admin_createPost(payload).catch(e => _errorLog);
      // } else if (command === 'admin:get-stats') {
      //   await self.admin_getStats(payload).catch(e => _errorLog);
      // } else if (command === 'admin:send-notification') {
      //   await self.admin_sendNotification(payload).catch(e => _errorLog);
      } else if (command === 'admin:firestore-read' || command === 'firestore-read') {
        await self.admin_firestoreRead(payload).catch(e => _errorLog);
      } else if (command === 'admin:firestore-write' || command === 'firestore-write') {
        await self.admin_firestoreWrite(payload).catch(e => _errorLog);
      // } else if (command === 'admin:firestore-query') {
      //   await self.admin_query(payload).catch(e => _errorLog);

      // End
      } else {
        response.status = 401;
        response.error = new Error(`Improper command supplied: ${command}`);
      }

      self.assistant.log('Api payload', {object: payload, string: JSON.stringify(payload)})

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },

  // General
  general_paymentProcessor: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      const productId = _.get(payload, 'data.payload.payload.details.productIdGlobal');
      if (!productId) {
        return reject(new Error('No productId'))
      }
      const processorPath = `${process.cwd()}/payment-processors/${productId}.js`
      let processor;
      // console.log('---processorPath', processorPath);
      try {
        processor = new (require(processorPath));
        processor.Manager = self.Manager;
      } catch (e) {
        self.assistant.error('Error loading processor', processorPath, e)
        return resolve()
      }

      await processor.process(payload.data.payload)
      .then(result => {
        payload.response.data = result;
        return resolve(result);
      })
      .catch(e => {
        self.Manager.libraries.sentry.captureException(e);
        console.error(`Payment processor @ "${processorPath}" failed`, e);
        return reject(e);
      })
    });
  },
  general_generateUUID: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {

    });
  },

  // User
  user_createCustomToken: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated || payload.user.roles.admin) {
        await self.libraries.admin.auth().createCustomToken(payload.user.auth.uid)
        .then(token => {
          payload.response.data.token = token;
          return resolve(payload);
        })
        .catch(e => {
          payload.response.status = 401;
          payload.response.error = new Error(`Failed to create custom token: ${e}`);
          return reject(payload.response.error);
        })
      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }
    });
  },
  user_delete: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated || payload.user.roles.admin) {
        // const planExpireDate = new Date(_.get(payload.user, 'plan.expires.timestamp', 0));
        // if (planExpireDate >= new Date()) {
        //   payload.response.status = 401;
        //   payload.response.error = new Error(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`);
        //   return reject(payload.response.error);
        // }
        const isPlanActive = _.get(payload.user, 'plan.payment.active', null);
        if (isPlanActive === true) {
          payload.response.status = 401;
          payload.response.error = new Error(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`);
          return reject(payload.response.error);
        }

        await self.libraries.admin.auth().deleteUser(payload.user.auth.uid)
        .then(() => {
          return resolve(payload);
        })
        .catch(e => {
          payload.response.status = 401;
          payload.response.error = new Error(`Failed to delete user: ${e}`);
          return reject(payload.response.error);
        })
      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }
    });
  },
  user_signOutAllSessions: async function (payload) {
    const self = this;
    const powertools = self.Manager.require('node-powertools')
    return new Promise(async function(resolve, reject) {
      const uid = _.get(payload.user, 'auth.uid', null);

      if (payload.user.authenticated || payload.user.roles.admin && uid) {
        await self.libraries.admin.database().ref(`gatherings/online`)
        .orderByChild('uid')
        .equalTo(uid)
        .once('value')
        .then(async snap => {
          const data = snap.val();
          const keys = Object.keys(data || {});
          for (var i = 0; i < keys.length; i++) {
            const key = keys[i];
            self.assistant.log(`Signing out: ${key}`);
            await self.libraries.admin.database().ref(`gatherings/online/${key}/command`).set('signout').catch(e => self.assistant.error(`Failed to signout ${key}`, e))
            await powertools.wait(3000);
            await self.libraries.admin.database().ref(`gatherings/online/${key}`).remove().catch(e => self.assistant.error(`Failed to delete ${key}`, e))
          }
        })
        .catch(e => {
          console.error('Gathering query error', e);
        })

        await self.libraries.admin
          .auth()
          .revokeRefreshTokens(uid)
          .then(() => {
            self.assistant.log('Signed user out of all sessions', payload.user.auth.uid)
            payload.data = {message: `Successfully signed ${payload.user.auth.uid} out of all sessions`}
            return resolve(payload.data);
          })
          .catch(e => {
            payload.response.status = 500;
            payload.response.error = e;
          })

        if (payload.response.status >= 200 && payload.response.status < 300) {
          return resolve(payload.response.data);
        } else {
          return reject(payload.response.error);
        }
      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }

    });
  },
  user_getSubscriptionInfo: async function (payload) {
    const self = this;
    const uid = _.get(payload, 'data.payload.uid', null)

    return new Promise(async function(resolve, reject) {
      // console.log('----payload.data', payload.data);

      if (!uid) {
        payload.response.status = 401;
        payload.response.error = new Error(`Improper uid supplied: ${uid}`);
        return reject(payload);
      }

      await self.libraries.admin.firestore().doc(`users/${uid}`)
      .get()
      .then(doc => {
        const data = doc.data();
        if (!data) {
          payload.response.status = 401;
          payload.response.error = new Error(`Cannot find user with uid: ${uid}`);
          return reject(payload.response.data);
        } else {
          payload.response.data = {
            plan: {
              id: data.plan.id,
              payment: {
                active: data.plan.payment.active,
              },
            }
          }
          return resolve(payload.response.data);
        }

      })
      .catch(e => {
        payload.response.status = 500;
        payload.response.error = e;
        return reject(payload);
      })
      //
      //
      // const isPlanActive = _.get(payload.user, 'plan.payment.active', null);
      // if (isPlanActive === true) {
      //   payload.response.status = 401;
      //   payload.response.error = new Error(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`);
      //   return reject(payload.response.error);
      // }
      //
      // await self.libraries.admin.auth().deleteUser(payload.user.auth.uid)
      // .then(() => {
      //   return resolve(payload);
      // })
      // .catch(e => {
      //   payload.response.status = 401;
      //   payload.response.error = new Error(`Failed to delete user: ${e}`);
      //   return reject(payload.response.error);
      // })
    });
  },
  user_signUp: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {

    });
  },

  // Handler
  handler_createPost: require('./api/handler/create-post.js'),

  // Admin
  admin_createPost: require('./api/admin/create-post.js'),
  admin_getStats: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {

    });
  },
  admin_sendNotification: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {

    });
  },
  admin_firestoreRead: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated || payload.user.roles.admin) {

        // console.log('---payload.data.payload', payload.data.payload);

        payload.data.payload.path = `${payload.data.payload.path || ''}`;
        payload.data.payload.document = payload.data.payload.document || {};
        payload.data.payload.options = payload.data.payload.options || { merge: true };


        if (!payload.data.payload.path) {
          payload.response.status = 401;
          payload.response.error = new Error('Path parameter required');
          return reject(payload);
        } else {
          await self.libraries.admin.firestore().doc(payload.data.payload.path)
          .get()
          .then(doc => {
            payload.response.data = doc.data();
            return resolve(payload.response.data);
          })
          .catch(e => {
            payload.response.status = 500;
            payload.response.error = e;
            return reject(payload);
          })
        }

      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }
    });
  },
  admin_firestoreWrite: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated || payload.user.roles.admin) {

        payload.data.payload.path = `${payload.data.payload.path || ''}`;
        payload.data.payload.document = payload.data.payload.document || {};
        payload.data.payload.options = payload.data.payload.options || { merge: true };

        if (!payload.data.payload.path) {
          payload.response.status = 401;
          payload.response.error = new Error('Path parameter required');
          return reject(payload);
        } else {
          await self.libraries.admin.firestore().doc(payload.data.payload.path)
          .set(payload.data.payload.document, payload.data.payload.options)
          .then(r => {
            return resolve(payload);
          })
          .catch(e => {
            payload.response.status = 500;
            payload.response.error = e;
            return reject(payload);
          })
        }

      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }
    });
  },
  admin_query: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {

    });
  },

}
module.exports = Module;
