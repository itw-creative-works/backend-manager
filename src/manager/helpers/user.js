const uuid4 = require('uuid').v4;
const powertools = require('node-powertools');
const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator(256);

/**
 * User schema definition
 *
 * Each leaf field is { type, default, nullable }
 * Special keys:
 *   $passthrough  — preserve all existing keys from input, don't strip unknowns
 *   $template     — shape applied to every dynamic key in a $passthrough object
 *   '$template'   — (string value) reference to parent's $template
 *   '$timestamp'  — shorthand for { timestamp, timestampUNIX } defaulting to epoch
 *   '$timestamp:now' — same but defaults to current time
 *   '$uuid', '$randomId', '$apiKey', '$oldDate' — resolved at runtime
 */
const SCHEMA = {
  auth: {
    uid: { type: 'string', default: null, nullable: true },
    email: { type: 'string', default: null, nullable: true },
    temporary: { type: 'boolean', default: false },
  },
  subscription: {
    product: {
      id: { type: 'string', default: 'basic' },
      name: { type: 'string', default: 'Basic' },
    },
    status: { type: 'string', default: 'active' },
    expires: '$timestamp',
    trial: {
      claimed: { type: 'boolean', default: false },
      expires: '$timestamp',
    },
    cancellation: {
      pending: { type: 'boolean', default: false },
      date: '$timestamp',
    },
    payment: {
      processor: { type: 'string', default: null, nullable: true },
      resourceId: { type: 'string', default: null, nullable: true },
      frequency: { type: 'string', default: null, nullable: true },
      startDate: '$timestamp',
      updatedBy: {
        event: {
          name: { type: 'string', default: null, nullable: true },
          id: { type: 'string', default: null, nullable: true },
        },
        date: '$timestamp',
      },
    },
  },
  roles: {
    $passthrough: true,
    admin: { type: 'boolean', default: false },
    betaTester: { type: 'boolean', default: false },
    developer: { type: 'boolean', default: false },
  },
  flags: {
    $passthrough: true,
    signupProcessed: { type: 'boolean', default: false },
  },
  affiliate: {
    code: { type: 'string', default: '$randomId' },
    referrals: { type: 'array', default: [] },
  },
  activity: {
    lastActivity: '$timestamp:now',
    created: '$timestamp:now',
    geolocation: {
      ip: { type: 'string', default: null, nullable: true },
      continent: { type: 'string', default: null, nullable: true },
      country: { type: 'string', default: null, nullable: true },
      region: { type: 'string', default: null, nullable: true },
      city: { type: 'string', default: null, nullable: true },
      latitude: { type: 'number', default: 0 },
      longitude: { type: 'number', default: 0 },
    },
    client: {
      language: { type: 'string', default: null, nullable: true },
      mobile: { type: 'boolean', default: false },
      device: { type: 'string', default: null, nullable: true },
      platform: { type: 'string', default: null, nullable: true },
      browser: { type: 'string', default: null, nullable: true },
      vendor: { type: 'string', default: null, nullable: true },
      runtime: { type: 'string', default: null, nullable: true },
      userAgent: { type: 'string', default: null, nullable: true },
      url: { type: 'string', default: null, nullable: true },
    },
  },
  api: {
    clientId: { type: 'string', default: '$uuid' },
    privateKey: { type: 'string', default: '$apiKey' },
  },
  usage: {
    $passthrough: true,
    $template: {
      period: { type: 'number', default: 0 },
      total: { type: 'number', default: 0 },
      last: {
        id: { type: 'string', default: null, nullable: true },
        timestamp: { type: 'string', default: '$oldDate' },
        timestampUNIX: { type: 'number', default: 0 },
      },
    },
    requests: '$template',
  },
  personal: {
    birthday: '$timestamp',
    gender: { type: 'string', default: null, nullable: true },
    location: {
      country: { type: 'string', default: null, nullable: true },
      region: { type: 'string', default: null, nullable: true },
      city: { type: 'string', default: null, nullable: true },
    },
    name: {
      first: { type: 'string', default: null, nullable: true },
      last: { type: 'string', default: null, nullable: true },
    },
    company: {
      name: { type: 'string', default: null, nullable: true },
      position: { type: 'string', default: null, nullable: true },
    },
    telephone: {
      countryCode: { type: 'number', default: 0 },
      national: { type: 'number', default: 0 },
    },
  },
  oauth2: {
    $passthrough: true,
  },
  attribution: {
    affiliate: {
      code: { type: 'string', default: null, nullable: true },
      timestamp: { type: 'string', default: null, nullable: true },
      url: { type: 'string', default: null, nullable: true },
      page: { type: 'string', default: null, nullable: true },
    },
    utm: {
      tags: { $passthrough: true },
      timestamp: { type: 'string', default: null, nullable: true },
      url: { type: 'string', default: null, nullable: true },
      page: { type: 'string', default: null, nullable: true },
    },
  },
};

/**
 * Check if a schema node is a leaf field definition (has 'type' and 'default')
 */
function isLeaf(node) {
  return node !== null
    && typeof node === 'object'
    && typeof node.type === 'string'
    && 'default' in node;
}

/**
 * Coerce a value to the expected type. Returns the coerced value or undefined if coercion fails.
 */
function coerce(value, type) {
  if (typeof value === type) {
    return value;
  }

  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    }
    case 'boolean': {
      if (value === 'true' || value === 1) return true;
      if (value === 'false' || value === 0) return false;
      return Boolean(value);
    }
    case 'string': {
      return String(value);
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Resolve a single leaf field value
 */
function resolveLeaf(leaf, value, ctx) {
  // Null handling
  if (value === null) {
    return leaf.nullable ? null : resolveDefault(leaf.default, ctx);
  }

  // Undefined → apply default
  if (value === undefined) {
    return resolveDefault(leaf.default, ctx);
  }

  // Array type — just check it's an array, don't coerce
  if (leaf.type === 'array') {
    return Array.isArray(value) ? value : resolveDefault(leaf.default, ctx);
  }

  // Type coercion
  if (typeof value !== leaf.type) {
    const coerced = coerce(value, leaf.type);
    return coerced !== undefined ? coerced : resolveDefault(leaf.default, ctx);
  }

  return value;
}

/**
 * Resolve a default value, handling special tokens
 */
function resolveDefault(def, ctx) {
  if (typeof def !== 'string' || !def.startsWith('$')) {
    // For arrays, return a fresh copy to avoid shared references
    if (Array.isArray(def)) {
      return [...def];
    }
    return def;
  }

  switch (def) {
    case '$uuid':
      return `${uuid4()}`;
    case '$randomId':
      return ctx.Manager.Utilities().randomId({ size: 8 });
    case '$apiKey':
      return `${uidgen.generateSync()}`;
    case '$oldDate':
      return ctx.oldDate;
    case '$oldDateUNIX':
      return ctx.oldDateUNIX;
    case '$now':
      return ctx.now;
    case '$nowUNIX':
      return ctx.nowUNIX;
    default:
      return def;
  }
}

/**
 * Expand $timestamp shorthand into a schema branch
 */
function expandTimestamp(variant) {
  const useNow = variant === '$timestamp:now';

  return {
    timestamp: { type: 'string', default: useNow ? '$now' : '$oldDate' },
    timestampUNIX: { type: 'number', default: useNow ? '$nowUNIX' : 0 },
  };
}

/**
 * Recursively resolve a schema node against input data
 */
function resolve(schema, data, ctx) {
  data = data || {};
  const result = {};

  // If $passthrough, start by copying all existing keys from data
  const isPassthrough = schema.$passthrough === true;
  const template = schema.$template || null;

  if (isPassthrough) {
    // Copy all data keys first (they'll be overwritten by defined schema fields below)
    for (const key of Object.keys(data)) {
      if (template && !key.startsWith('$') && !(key in schema)) {
        // Dynamic key — resolve against template
        result[key] = resolve(template, data[key], ctx);
      } else if (!(key in schema) || key.startsWith('$')) {
        // Unknown key not in schema — passthrough as-is
        result[key] = data[key];
      }
    }
  }

  // Now resolve each defined schema field
  for (const [key, node] of Object.entries(schema)) {
    // Skip meta keys
    if (key.startsWith('$')) {
      continue;
    }

    // Handle string shorthands
    if (typeof node === 'string') {
      if (node === '$template') {
        // Resolve against parent's $template
        result[key] = resolve(template, data[key], ctx);
        continue;
      }
      if (node.startsWith('$timestamp')) {
        // Expand timestamp shorthand and recurse
        result[key] = resolve(expandTimestamp(node), data[key], ctx);
        continue;
      }
    }

    // Leaf field
    if (isLeaf(node)) {
      result[key] = resolveLeaf(node, data[key], ctx);
      continue;
    }

    // Nested branch (plain object)
    if (node !== null && typeof node === 'object') {
      result[key] = resolve(node, data[key], ctx);
      continue;
    }
  }

  return result;
}

// ─── User constructor ───

function User(Manager, settings) {
  const self = this;

  self.Manager = Manager;

  settings = settings || {};

  // Build resolver context
  const now = powertools.timestamp(new Date(), { output: 'string' });
  const ctx = {
    Manager,
    now: now,
    nowUNIX: powertools.timestamp(now, { output: 'unix' }),
    oldDate: powertools.timestamp(new Date(0), { output: 'string' }),
    oldDateUNIX: powertools.timestamp(new Date(0), { output: 'unix' }),
  };

  // Resolve
  self.properties = resolve(SCHEMA, settings, ctx);

  return self;
}

module.exports = User;
