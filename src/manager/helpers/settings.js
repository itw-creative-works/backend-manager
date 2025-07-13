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

  // Shortcuts
  const Manager = self.Manager;

  // Set settings
  schema = schema || undefined;
  settings = settings || {};

  // Set options
  options = options || {};
  options.dir = typeof options.dir === 'undefined' ? `${Manager.cwd}/schemas` : options.dir;
  options.schema = typeof options.schema === 'undefined' ? undefined : options.schema;
  options.user = options.user || assistant.request.user;
  options.checkRequired = typeof options.checkRequired === 'undefined' ? true : options.checkRequired;

  // Load schema if not provided and schema is defined in options
  // console.log('----schema:', schema);
  // console.log('----settings:', settings);
  // console.log('----options.dir:', options.dir);
  // console.log('----options.schema:', options.schema);
  if (
    typeof schema === 'undefined'
    && typeof options.schema !== 'undefined'
  ) {
    // Try to load method-specific schema first, then fallback to main schema
    const method = (assistant?.request?.method || '').toLowerCase();
    const methodFile = `${method}.js`;
    const schemaFile = options.schema.replace('.js', '');
    let schemaPath;

    // First try method-specific schema (e.g., test/get.js, test/post.js)
    const methodSchemaPath = path.resolve(options.dir, `${schemaFile}/${methodFile}`);

    try {
      schema = loadSchema(assistant, methodSchemaPath, settings, options);
      assistant.log(`Settings.resolve(): Loaded method-specific schema: ${schemaFile}/${methodFile}`);
    } catch (e) {
      // Fallback to main schema if method-specific doesn't exist
      schemaPath = path.resolve(options.dir, `${schemaFile}/index.js`);
      schema = loadSchema(assistant, schemaPath, settings, options);
      assistant.log(`Settings.resolve(): Method-specific schema not found, using main schema fallback`);
    }
  }

  // If schema is not an object, throw an error
  if (!schema || typeof schema !== 'object') {
    throw assistant.errorify(`Invalid schema provided`, {code: 400});
  }

  // Resolve settings
  self.settings = powertools.defaults(settings, schema);
  // self.schema = _.merge({}, schema);
  const resolvedSchema = {};

  // console.log('---schema', schema);
  // console.log('---options', options);
  // console.log('---self.settings', self.settings);

  // Iterate each key and check for some things
  iterateSchema(schema, (path, schemaNode) => {
    const originalValue = _.get(settings, path);
    const resolvedValue = _.get(self.settings, path);
    let replaceValue = undefined;

    // console.log('Found:', path, schemaNode);
    // console.log('originalValue:', originalValue);
    // console.log('resolvedValue:', resolvedValue);

    // Check if this node is marked as required
    let isRequired = false;
    if (typeof schemaNode.required === 'function') {
      isRequired = schemaNode.required(assistant, settings, options);
    } else if (typeof schemaNode.required === 'boolean') {
      isRequired = schemaNode.required;
    }

    // console.log('isRequired:', isRequired);

    // If the key is required and the original value is undefined, throw an error
    if (options.checkRequired && isRequired && typeof originalValue === 'undefined') {
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

    // Set defaults
    // @@@TODO: FINISH THIS
    // !!! NOT SURE WHAT TO DO FOR DEFAULT SINCE IT CAN BE A FN SOMETIMES ???
    const resolvedNode = {
      types: schemaNode.types || [],
      // value: typeof replaceValue === 'undefined' ? undefined : replaceValue,
      // default: ???,
      required: isRequired,
      available: typeof schemaNode.available === 'undefined' ? true : schemaNode.available,
      min: typeof schemaNode.min === 'undefined' ? undefined : schemaNode.min,
      max: typeof schemaNode.max === 'undefined' ? undefined : schemaNode.max,
    }

    // Update schema
    _.set(resolvedSchema, path, resolvedNode);
  });

  // Set schema
  self.schema = resolvedSchema;

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

function iterateSchema(schema, fn, path) {
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
    iterateSchema(schema[key], fn, nextPath);
  });
}

function loadSchema(assistant, schemaPath, settings, options) {
  // Get plan ID
  const planId = options?.user?.plan?.id || 'basic';

  // Load schema
  const lib = require(schemaPath)(assistant, settings, options);
  const def = lib.defaults;
  const plan = lib[planId];

  // Merge
  return _.merge({}, def, plan);
}

module.exports = Settings;
