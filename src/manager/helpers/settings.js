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
  schema = schema || {};
  settings = settings || {};

  // Reset settings
  self.settings = null;

  assistant.log('Resolving settings for', schema, settings);

  if (typeof schema === 'string') {
    const schemaPath = path.resolve(process.cwd(), `schemas/${schema.replace('.js', '')}.js`);

    schema = loadSchema(assistant, schemaPath, settings);
  }

  self.settings = powertools.defaults(settings, schema);

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
