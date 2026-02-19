const path = require('path');
const _ = require('lodash');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;

  // Set properties
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
  self.assistant.request.data.options = self.assistant.request.data.options || {};

  // Return
  return self;
}

Module.prototype.main = function() {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const req = self.req;
  const res = self.res;

  return new Promise(async function(resolve, reject) {
    return libraries.cors(req, res, async () => {
      // Legacy command-based API only - new-style requests are routed via RequestRouter
      // Set properties
      self.payload.data = assistant.request.data;
      self.payload.user = await assistant.authenticate();

      // Extract Bearer token from Authorization header and set to payload.data.authenticationToken
      // This ensures backwards compatibility for code that expects the token in the payload
      // Eventually, all code should use payload.data.authenticationToken directly
      const authHeader = assistant.request.headers?.authorization || '';
      if (!self.payload.data.authenticationToken && authHeader.startsWith('Bearer ')) {
        self.payload.data.authenticationToken = authHeader.split('Bearer ')[1];
      }

      // Set properties
      const headers = assistant.request.headers;
      const method = assistant.request.method;
      const url = assistant.request.url;
      const geolocation = assistant.request.geolocation;
      const client = assistant.request.client;

      // Strip URL
      const strippedUrl = stripUrl(url);

      // Quit if OPTIONS request
      if (method === 'OPTIONS') {
        return resolve();
      }

      // Resolve command
      const resolved = self.resolveCommand(self.payload.data.command);

      // Log
      // assistant.log(`Executing: ${resolved.command}`, self.payload, JSON.stringify(self.payload))
      // assistant.log(`Resolved URL: ${Manager.project.functionsUrl}?command=${encodeURIComponent(resolved.command)}&payload=${encodeURIComponent(JSON.stringify(self.assistant.request.data.payload))}`)
      assistant.log(`bm_api(${resolved.command}): Request (${geolocation.ip || 'unknown'} @ ${geolocation.country || '?'}, ${geolocation.region || '?'}, ${geolocation.city || '?'}) [${method} > ${strippedUrl}]`, JSON.stringify(assistant.request.data));
      assistant.log(`bm_api(${resolved.command}): Headers`, JSON.stringify(headers));


      // Set up options
      self.payload.data.options = self.payload.data.options || {};
      self.payload.data.options.delay = self.payload.data.options.delay || 0;

      // Delay
      if (self.payload.data.options.delay > 0) {
        let delay = Math.floor(self.payload.data.options.delay / 1000);

        await powertools.poll(() => {
          assistant.log(`Delaying for ${delay--} seconds...`);
        }, {interval: 1000, timeout: self.payload.data.options.delay})
        .catch(e => e);
      }

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
              // console.log('---result', result);
              // console.log('---self.payload.response.data', self.payload.response.data);
              self.payload.response.status = result.status || self.payload.response.status || 200;
              self.payload.response.data = result.data || self.payload.response.data || {};
              self.payload.response.redirect = result.redirect || self.payload.response.redirect || null;
            })
            .catch(e => {
              // console.log('---e', e);
              self.payload.response.status = e && e.code ? e.code : 500;
              self.payload.response.error = e || new Error('Unknown error occured');
            })
          } catch (e) {
            self.payload.response.status = e && e.code ? e.code : 500;
            self.payload.response.error = e || new Error('Unknown error occured');
          }
        })
        .catch(e => {
          self.payload.response.status = 400;
          self.payload.response.error = new Error(`Failed to import: ${e}`);
        })
      }

      // Fix status
      self.payload.response.status = _fixStatus(self.payload.response.status);

      // Set status
      res.status(self.payload.response.status)

      // Send response
      if (self.payload.response.status >= 200 && self.payload.response.status < 399) {
        assistant.log(`Finished ${resolved.command} (status=${self.payload.response.status})`, self.payload, JSON.stringify(self.payload))

        if (self.payload.response.redirect) {
          res.redirect(self.payload.response.redirect);
          return resolve();
        } else {
          res.json(self.payload.response.data);
          return resolve();
        }
      } else {
        assistant.error(`Error executing ${resolved.command} @ ${resolved.path} (status=${self.payload.response.status}):`, self.payload.response.error)
        res.send(`${self.payload.response.error}`)
        return reject(self.payload.response.error);
      }
    });
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

      // 11/27/2024 - Separated this IF/ELSE into two separate IFs
      // Set backendManagerKey and authenticationToken if it's provided
      if (self.payload.data.backendManagerKey) {
        lib.payload.data.backendManagerKey = self.payload.data.backendManagerKey;
      }
      if (self.payload.data.authenticationToken) {
        lib.payload.data.authenticationToken = self.payload.data.authenticationToken;
      }

      // Set itself to the instance
      self.lib = lib;

      // console.log('***** import() lib.payload 4', lib.payload);

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

  // Shortcuts
  const assistant = self.assistant;

  // Set original command
  const originalCommand = command;

  // Set properties
  const method = assistant.request.method;

  // Set command
  command = command || '';

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

  // End
  } else {
    // command = 'error:error';
  }

  // Check local path
  const resolvedPath = self.resolveApiPath(command);

  // Log if command does not exist
  if (method !== 'OPTIONS' && !resolvedPath) {
    assistant.error(`This command does not exist: ${originalCommand} => ${command} @ ${resolvedPath}`)
  }

  return {
    command: command,
    path: resolvedPath,
    exists: !!resolvedPath,
  };
}

Module.prototype.resolveUser = function (options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    let user = null;

    options = options || {};
    options.uid = typeof options.uid !== 'undefined' ? options.uid : self.payload?.data?.payload?.uid;
    options.admin = typeof options.admin !== 'undefined' ? options.admin : self.payload?.user?.roles?.admin;
    options.adminRequired = typeof options.adminRequired !== 'undefined' ? options.adminRequired : true;

    if (options.uid) {
      if (options.adminRequired && !options.admin) {
        user = self.assistant.errorify('Admin required', {code: 401});
      } else {
        await self.libraries.admin.firestore().doc(`users/${options.uid}`)
        .get()
        .then(async function (doc) {
          const data = doc.data();
          if (data) {
            user = data;
          } else {
            user = self.assistant.errorify(`User does not exist: ${options.uid}`, {code: 400});
          }
        })
        .catch(function (e) {
          user = self.assistant.errorify(e, {code: 500});
        })
      }
    } else if (self.payload.user.authenticated) {
      user = self.payload.user;
    } else if (self.lib?.payload?.user?.authenticated) {
      user = self.lib.payload.user;
    }

    if (user instanceof Error) {
      return reject(user);
    } else if (!user) {
      return reject(self.assistant.errorify('Authentication required', {code: 401}));
    } else {
      return resolve(user);
    }

  });
};

function _fixStatus(status) {
  if (typeof status === 'number') {
    return status;
  } else {
    if (status === 'ok') {
      return 200
    } else {
      return 500
    }
  }
}

function resolveBasePath(basePath, command) {
  const sanitizedCommand = command.replace(/\.\.\//g, '').replace(/\:/, '/');
  const resolvedPath = path.join(basePath, `${sanitizedCommand}.js`);

  return resolvedPath;
};

Module.prototype.resolveApiPath = function (command) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const req = self.req;
  const res = self.res;

  // Set paths
  const projectBasePath = path.join(Manager.cwd, 'routes/api');
  const localBasePath = './api/';

  const projectPath = resolveBasePath(projectBasePath, command);
  const localPath = path.join(__dirname, resolveBasePath(localBasePath, command));

  if (jetpack.exists(projectPath)) {
    return projectPath;
  } else if (jetpack.exists(localPath)) {
    return localPath;
  } else {
    return null;
  }
};

function stripUrl(url) {
  const newUrl = new URL(url);

  return `${newUrl.hostname}${newUrl.pathname}`.replace(/\/$/, '');
}

module.exports = Module;
