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

    let user = await assistant.authenticate();

    return libraries.cors(req, res, async () => {
      const command = assistant.request.data.command;
      const payload = {
        response: response,
        data: assistant.request.data,
        user: user,
      }
      if (command === 'create-custom-token') {
        await self.createCustomToken(payload).catch(e => {self.assistant.log(e, {environment: 'production'})});
      } else if (command === 'delete-user') {
        await self.deleteUser(payload).catch(e => {self.assistant.log(e, {environment: 'production'})});
      } else if (command === 'payment-processor') {
        await self.paymentProcessor(payload).catch(e => {self.assistant.log(e, {environment: 'production'})});
      } else if (command === 'sign-out-all-sessions') {
        await self.signOutAllSessions(payload).catch(e => {self.assistant.log(e, {environment: 'production'})});
      } else {
        response.status = 401;
        response.error = new Error(`Improper command supplied: ${command}`);
      }

      self.assistant.log('Api payload', payload, {environment: 'production'})

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
  createCustomToken: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated) {
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
  deleteUser: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated) {
        const planExpireDate = new Date(_.get(payload.user, 'plan.expires.timestamp', 0));
        if (planExpireDate >= new Date()) {
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
  paymentProcessor: async function (payload) {
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
        self.assistant.error('Error loading processor', processorPath, e, {environment: 'production'})
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
  signOutAllSessions: async function (payload) {
    const self = this;
    const powertools = self.Manager.require('node-powertools')
    return new Promise(async function(resolve, reject) {
      const uid = _.get(payload.user, 'auth.uid', null);
      if (payload.user.authenticated && uid) {

        await self.libraries.admin.database().ref(`gatherings/online`)
        .orderByChild('uid')
        .equalTo(uid)
        .once('value')
        .then(async snap => {
          const data = snap.val();
          const keys = Object.keys(data || {});
          for (var i = 0; i < keys.length; i++) {
            const key = keys[i];
            self.assistant.log(`Signing out: ${key}`, {environment: 'production'});
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
            self.assistant.error('Signed user out of all sessions', payload.user.auth.uid, {environment: 'production'})
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
}
module.exports = Module;
