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

Settings.prototype.resolve = function (assistant, schema, settings, options) {
  const self = this;
  const Manager = self.Manager;

  // Set settings
  schema = schema || undefined;
  settings = settings || {};

  // Set options
  options = options || {};
  options.dir = typeof options.dir === 'undefined' ? `${Manager.cwd}/schemas` : options.dir;
  options.schema = typeof options.schema === 'undefined' ? undefined : options.schema;

  // Load schema if not provided and schema is defined in options
  // console.log('----schema:', schema);
  // console.log('----settings:', settings);
  // console.log('----options.dir:', options.dir);
  // console.log('----options.schema:', options.schema);
  if (
    typeof schema === 'undefined'
    && typeof options.schema !== 'undefined'
  ) {
    const schemaPath = path.resolve(options.dir, `${options.schema.replace('.js', '')}.js`);

    schema = loadSchema(assistant, schemaPath, settings);
  }

  // Resolve settings
  self.settings = powertools.defaults(settings, schema);

  // If schema is not an object, throw an error
  if (!schema || typeof schema !== 'object') {
    throw assistant.errorify(`Invalid schema provided`, {code: 400});
  }
  // console.log('---schema', schema);
  // console.log('---self.settings', self.settings);

  // Iterate each key and check for some things
  processSchema(schema, (path, schemaNode) => {
    const originalValue = _.get(settings, path);
    const resolvedValue = _.get(self.settings, path);
    let replaceValue = undefined;

    // assistant.log('Found:', path, schemaNode);
    // assistant.log('originalValue:', originalValue);
    // assistant.log('resolvedValue:', resolvedValue);

    // Check if this node is marked as required
    let isRequired = false;
    if (typeof schemaNode.required === 'function') {
      isRequired = schemaNode.required(assistant);
    } else if (typeof schemaNode.required === 'boolean') {
      isRequired = schemaNode.required;
    }

    // assistant.log('isRequired:', isRequired);

    // If the key is required and the original value is undefined, throw an error
    if (isRequired && typeof originalValue === 'undefined') {
      throw assistant.errorify(`Required key {${path}} is missing in settings`, {code: 400});
    }

    // Clean
    if (schemaNode.clean) {
      if (schemaNode.clean instanceof RegExp) {
        replaceValue = resolvedValue.replace(schemaNode.clean, '');
      } else if (typeof schemaNode.clean === 'function') {
        replaceValue = schemaNode.clean(resolvedValue);
      }
    }

    // assistant.log('replaceValue:', replaceValue);

    // Replace
    if (typeof replaceValue !== 'undefined' && replaceValue !== resolvedValue) {
      assistant.warn(`Replacing ${path}: originalValue=${originalValue}, resolvedValue=${resolvedValue}, replaceValue=${replaceValue}`);
      _.set(self.settings, path, replaceValue);
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

function processSchema(schema, fn, path) {
  path = path || '';

  // Base case: Check if the current level has 'types' and 'default', indicating metadata
  if (schema.hasOwnProperty('types') && schema.hasOwnProperty('default')) {
    // Call the processing function with the current path and schema as arguments
    fn(path, schema);
    return;
  }

  // Recursive case: Iterate through nested keys if we're not at a metadata node
  Object.keys(schema).forEach(key => {
    const nextPath = path ? `${path}.${key}` : key;
    processSchema(schema[key], fn, nextPath);
  });
}

function loadSchema(assistant, schema, settings) {
  const planId = assistant.request.user.plan.id;

  const lib = require(schema)(assistant);
  const def = lib.defaults;
  const plan = lib[planId];

  // Merge
  return _.merge({}, def, plan);
}

module.exports = Settings;
