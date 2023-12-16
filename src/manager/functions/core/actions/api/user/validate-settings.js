const _ = require('lodash')
const jetpack = require('fs-jetpack')
const powertools = require('node-powertools')
const path = require('path')

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    Api.resolveUser({adminRequired: true})
    .then(async (user) => {

      payload.data.payload.defaultsPath = payload.data.payload.defaultsPath || '';
      payload.data.payload.existingSettings = payload.data.payload.existingSettings || {};
      payload.data.payload.newSettings = payload.data.payload.newSettings || {};

      const settings = _.merge({}, payload.data.payload.existingSettings, payload.data.payload.newSettings);

      const resolvedPath = path.join(process.cwd(), `defaults.js`);

      // Check if the file exists
      if (!jetpack.exists(resolvedPath)) {
        return reject(assistant.errorManager(`Defaults file at ${resolvedPath} does not exist, please add it manually.`, {code: 500, sentry: true, send: false, log: true}).error);
      }

      // Load the file
      try {
        const defaults = _.get(require(resolvedPath)(), payload.data.payload.defaultsPath);
        const combined = combine(defaults.all, defaults[user.plan.id] || {})

        assistant.log('Combined settings', combined)

        return resolve({data: powertools.defaults(settings, combined)});
      } catch (e) {
        return reject(assistant.errorManager(`Unable to load file at ${resolvedPath}: ${e}`, {code: 500, sentry: true, send: false, log: true}).error);
      }

    })
    .catch(e => {
      return reject(e);
    })
  });

};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function combine(one, two) {
  const done = [];

  // Iterate through the keys of the second object
  powertools.getKeys(two)
    .forEach(path => {
      const pathMinusLast = path.split('.').slice(0, -1).join('.');
      const valueAtPath = _.get(two, path);
      const valueAtParent = _.get(two, pathMinusLast);

      if (
        done.includes(pathMinusLast)
        || isObject(valueAtPath)
      ) {
        return;
      }

      // If the path is an object, merge the two object using lodash
      _.set(one, pathMinusLast, valueAtParent)

      done.push(pathMinusLast);
    })
  return one;
}


module.exports = Module;
