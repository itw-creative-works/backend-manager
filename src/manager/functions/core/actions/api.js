const path = require('path');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant({req: data.req, res: data.res})
  self.req = data.req;
  self.res = data.res;

  return self;
}

Module.prototype.main = function() {
  const self = this;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const req = self.req;
  const res = self.res;

  return libraries.cors(req, res, async () => {
    const response = {
      status: 200,
      data: {},
      error: null,
    };
    const user = await assistant.authenticate();
    const command = resolveCommand(assistant.request.data.command);
    const commandPath = './' + path.join('./api/', `${command.replace(/\.\.\//g, '').replace(/\:/, '/')}.js`);
    const payload = {
      response: response,
      data: assistant.request.data,
      user: user,
    }

    self.assistant.log(`Executing: ${command}`, payload, JSON.stringify(payload), {environment: 'production'})

    try {
      const lib = new (require(commandPath))();
      try {
        await lib.init(self, payload);
        await lib.main()
        .then(r => {
          response.status = r.status || 200;
          response.data = r.data || {};
        })
        .catch(e => {
          response.status = e.code || 500;
          response.error = e || new Error('Unknown error occured');
        })
      } catch (e) {
        response.status = 500;
        response.error = e || new Error('Unknown error occured');
      }
    } catch (e) {
      response.status = 400;
      response.error = new Error(`Improper command supplied: ${command}`);
      assistant.log('Dev error log', e)
    }

    if (response.status === 200) {
      return res.status(response.status).json(response.data);
    } else {
      console.error(`Error executing ${command} @ ${commandPath}`, response.error)
      // return res.status(response.status).send(response.error.message);
      return res.status(response.status).send(`${response.error}`);
    }
  });
}

function resolveCommand(command) {
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

module.exports = Module;
