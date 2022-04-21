const path = require('path');
const _ = require('lodash');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant({req: data.req, res: data.res})
  self.req = data.req;
  self.res = data.res;
  self.payload = {
    response: {
      status: 200,
      data: {},
      error: null,
    },
    data: {},
    user: {},
  };

  return self;
}

Module.prototype.main = function() {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const req = self.req;
  const res = self.res;

  return libraries.cors(req, res, async () => {
    self.payload.data = assistant.request.data;
    self.payload.user = await assistant.authenticate();

    const command = self.resolveCommand(self.payload.data.command);
    const commandPath = './' + path.join('./api/', `${command.replace(/\.\.\//g, '').replace(/\:/, '/')}.js`);

    self.assistant.log(`Executing: ${command}`, self.payload, JSON.stringify(self.payload), {environment: 'production'})

    try {
      const lib = new (require(commandPath))();
      try {
        await lib.init(self, self.payload);
        await lib.main()
        .then(r => {
          self.payload.response.status = r.status || 200;
          self.payload.response.data = r.data || {};
        })
        .catch(e => {
          self.payload.response.status = e.code || 500;
          self.payload.response.error = e || new Error('Unknown error occured');
        })
      } catch (e) {
        self.payload.response.status = 500;
        self.payload.response.error = e || new Error('Unknown error occured');
      }
    } catch (e) {
      self.payload.response.status = 400;
      self.payload.response.error = new Error(`Improper command supplied: ${command}`);
      assistant.log('Dev error log', e)
    }

    if (self.payload.response.status === 200) {
      return res.status(self.payload.response.status).json(self.payload.response.data);
    } else {
      console.error(`Error executing ${command} @ ${commandPath}`, self.payload.response.error)
      // return res.status(self.payload.response.status).send(self.payload.response.error.message);
      return res.status(self.payload.response.status).send(`${self.payload.response.error}`);
    }
  });
}

Module.prototype.resolveCommand = function (command) {
  const self = this;

  // Start
  if (false) {

  // General
  } else if (command === 'general:generate-uuid' || command === 'generate-uuid') {
    command = 'general:generate-uuid';

  // User
  } else if (command === 'user:create-custom-token' || command === 'create-custom-token') { // rename: user:create-custom-token
    command = 'user:create-custom-token';
  } else if (command === 'user:delete' || command === 'delete-user') { // rename: user:delete
    command = 'user:delete';
  } else if (command === 'user:sign-out-all-sessions' || command === 'sign-out-all-sessions') { // rename: user:sign-out-all-sessions
    command = 'user:sign-out-all-sessions';
  } else if (command === 'user:get-subscription-info' || command === 'get-user-subscription-info') {  // rename: user:get-subscription-info
    command = 'user:get-subscription-info';
  } else if (command === 'user:sign-up' || command === 'sign-up') {
    command = 'user:sign-up';

  // Handler
  } else if (command === 'handler:create-post') {
    command = 'handler:create-post';

  // Admin
  } else if (command === 'admin:create-post') {
    command = 'admin:create-post';
  } else if (command === 'admin:get-stats') {
    command = 'admin:get-stats';
  } else if (command === 'admin:send-notification') {
    command = 'admin:send-notification';
  } else if (command === 'admin:firestore-read' || command === 'firestore-read') {
    command = 'admin:firestore-read';
  } else if (command === 'admin:firestore-write' || command === 'firestore-write') {
    command = 'admin:firestore-write';
  } else if (command === 'admin:firestore-query' || command === 'firestore-query') {
    command = 'admin:firestore-query';
  } else if (command === 'admin:payment-processor' || command === 'payment-processor') { // rename: admin:payment-processor
    command = 'admin:payment-processor';

  // Test
  } else if (command === 'test:authenticate' || command === 'authenticate') {
    command = 'test:authenticate';
  } else if (command === 'test:create-test-accounts' || command === 'create-test-accounts') {
    command = 'test:create-test-accounts';
  } else if (command === 'test:webhook' || command === 'webhook') {
    command = 'test:webhook';

  // End
  } else {
    command = '';
  }

  return command;
}

Module.prototype.resolveUser = function (options) {
  const self = this;
  return new Promise(async function(resolve, reject) {
    let user = null;

    options = options || {};
    options.uid = typeof options.uid !== 'undefined' ? options.uid : self.payload.data.payload.uid;
    options.admin = typeof options.admin !== 'undefined' ? options.admin : self.payload.user.roles.admin;
    options.adminRequired = typeof options.adminRequired !== 'undefined' ? options.adminRequired : true;

    if (options.uid) {
      if (options.adminRequired && !options.admin) {
        user = self.assistant.errorManager('Admin required', {code: 401, sentry: false, send: false, log: false}).error;
      } else {
        await self.libraries.admin.firestore().doc(`users/${options.uid}`)
        .get()
        .then(async function (doc) {
          const data = doc.data();
          if (data) {
            user = data;
          } else {
            user = self.assistant.errorManager(`User does not exist: ${options.uid}`, {code: 400, sentry: false, send: false, log: false}).error;
          }
        })
        .catch(function (e) {
          user = self.assistant.errorManager(e, {code: 500, sentry: false, send: false, log: false}).error;
        })
      }
    } else if (self.payload.user.authenticated) {
      user = self.payload.user;
    }

    if (user instanceof Error) {
      return reject(user);
    } else if (!user) {
      return reject(self.assistant.errorManager('Unable to resolve user', {code: 500, sentry: false, send: false, log: false}).error);
    } else {
      return resolve(user);
    }

  });
};

module.exports = Module;
