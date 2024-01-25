/**
 * Settings
 *
 */
// const jetpack = require('fs-jetpack');
const path = require('path');
const powertools = require('node-powertools');
const _ = require('lodash');
const moment = require('moment');

function Settings(m) {
  const self = this;

  self.Manager = m;

  self.settings = null;
}

Settings.prototype.resolve = function (assistant, schema, settings) {
  const self = this;
  const Manager = self.Manager;

  // Set settings
  schema = schema;
  settings = typeof settings === 'undefined' ? {} : settings;

  // Throw error if there is no schema
  if (typeof schema === 'undefined') {
    throw assistant.errorify(`Schema is undefined`, {code: 500, sentry: false, send: false, log: false});
  }

  // Reset settings
  self.settings = null;

  // Load schema
  if (typeof schema === 'string') {
    const schemaPath = path.resolve(process.cwd(), `schemas/${schema.replace('.js', '')}.js`);

    schema = loadSchema(assistant, schemaPath, settings);
  }

  // Resolve settings
  self.settings = powertools.defaults(settings, schema);

  // Check for missing required keys
  powertools.getKeys(schema).forEach((key) => {
    const isRequired = key.endsWith('.required') ? _.get(schema, key, false) : false;

    // Skip if not required
    if (!isRequired) {
      return;
    }

    // Use regex to replace '.required' only if it's at the end of the string
    const settingsKey = key.replace(/\.required$/, '');

    // Check if the required key is missing
    if (typeof _.get(settings, settingsKey, undefined) === 'undefined') {
      // Handle the missing required key as needed
      throw assistant.errorify(`Required key '${settingsKey}' is missing in settings`, {code: 400, sentry: false, send: false, log: false});
    }
  });

  // Resolve
  return self.settings;
};

Settings.prototype.constant = function (name, options) {
  const self = this;
  const Manager = self.Manager;

  options = options || {};
  options.date = typeof options.date === 'undefined' ? moment() : moment(options.date);

  if (name === 'timestamp') {
    return {
      types: ['string'],
      value: undefined,
      default: options.date.toISOString(),
    }
  } else if (name === 'timestampUNIX') {
    return {
      types: ['number'],
      value: undefined,
      default: options.date.unix(),
    }
  } else if (name === 'timestampFULL') {
    return {
      timestamp: self.constant('timestamp', options),
      timestampUNIX: self.constant('timestampUNIX', options),
    }
  }
};

function loadSchema(assistant, schema, settings) {
  const planId = assistant.request.user.plan.id;

  const lib = require(schema)(assistant);
  const def = lib.defaults;
  const plan = lib[planId];

  // Merge
  return _.merge({}, def, plan);
}

module.exports = Settings;
