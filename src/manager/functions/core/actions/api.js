const path = require('path');
const _ = require('lodash');
const jetpack = require('fs-jetpack');

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

  // Fix the two required
  const resolved = self.resolveCommand(self.assistant.request.data.command);
  self.assistant.request.data.command = resolved.command;
  self.assistant.request.data.payload = self.assistant.request.data.payload || {};

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

    const resolved = self.resolveCommand(self.payload.data.command);

    self.assistant.log(`Executing: ${resolved.command}`, self.payload, JSON.stringify(self.payload), {environment: 'production'})

    if (!resolved.exists) {
      self.payload.response.status = 400;
      self.payload.response.error = new Error(`${self.payload.data.command} is not a valid command`);
    } else {
      await self.import(resolved.command)
      .then(async lib => {
        try {
          // Call main function
          await lib.main()
          .then(result => {
            result = result || {};
            self.payload.response.status = result.status || self.payload.response.status || 200;
            self.payload.response.data = result.data || self.payload.response.data || {};
          })
          .catch(e => {
            self.payload.response.status = e.code || 500;
            self.payload.response.error = e || new Error('Unknown error occured');
          })
        } catch (e) {
          self.payload.response.status = 500;
          self.payload.response.error = e || new Error('Unknown error occured');
        }
      })
      .catch(e => {
        self.payload.response.status = 400;
        self.payload.response.error = new Error(`Failed to import: ${e}`);
      })
    }

    if (self.payload.response.status === 200) {
      return res.status(self.payload.response.status).json(self.payload.response.data);
    } else {
      console.error(`Error executing ${resolved.command} @ ${resolved.path}`, self.payload.response.error)
      // return res.status(self.payload.response.status).send(self.payload.response.error.message);
      return res.status(self.payload.response.status).send(`${self.payload.response.error}`);
    }
  });
}

Module.prototype.import = function (command, payload, user, response) {
  const self = this;

  return new Promise(function(resolve, reject) {
    const resolved = self.resolveCommand(command);

    try {
      const lib = new (require(resolved.path))();

      // Initialize
      lib.Api = self;
      lib.Manager = self.Manager;
      lib.libraries = self.Manager.libraries;
      lib.assistant = self.assistant;
      lib.payload = _.cloneDeep({
        data: {
          // command: '?',
          payload: payload ? payload : self.payload.data.payload,
        },
        user: user ? user : self.payload.user,
        response: response ? response : self.payload.response,
      });

      if (self.payload.data.backendManagerKey) {
        lib.payload.data.backendManagerKey = self.payload.data.backendManagerKey;
      } else if (self.payload.data.authenticationToken) {
        lib.payload.data.authenticationToken = self.payload.data.authenticationToken;
      }

      // lib.payload = {};
      //
      // // Set payload and user if it's provided
      // lib.payload.data.payload = payload ? _.cloneDeep(payload) : lib.payload.data.payload;
      // lib.payload.user = user ? _.cloneDeep(user) : lib.payload.user;
      // lib.payload.response = response ? _.cloneDeep(response) : lib.payload.response;

      return resolve(lib);
    } catch (e) {
      return reject(e);
    }

  });
}

Module.prototype.resolveCommand = function (command) {
  const self = this;
  const originalCommand = command;

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

  // Special
  // } else if (command === 'special:setup-electron-manager-client' || command === 'setup-electron-manager-client') {
    // command = 'special:setup-electron-manager-client';

  // Test
  // } else if (command === 'test:authenticate' || command === 'authenticate') {
  //   command = 'test:authenticate';
  // } else if (command === 'test:create-test-accounts' || command === 'create-test-accounts') {
  //   command = 'test:create-test-accounts';
  // } else if (command === 'test:webhook' || command === 'webhook') {
  //   command = 'test:webhook';

  // End
  } else {
    // command = 'error:error';
  }

  command = command || '';

  const resolvedPath = './' + path.join('./api/', `${command.replace(/\.\.\//g, '').replace(/\:/, '/')}.js`);
  const pathExists = jetpack.exists(path.join(__dirname, resolvedPath));

  // if (!command || command === 'error:error') {
  if (!pathExists) {
    self.assistant.log(`This command does not exist: ${originalCommand} => ${command} @ ${pathExists}`, {environment: 'production'})
  }

  return {
    command: command,
    path: resolvedPath,
    exists: !!pathExists,
  };
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
