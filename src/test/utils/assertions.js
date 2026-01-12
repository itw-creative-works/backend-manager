const assert = require('assert');

/**
 * Custom assertion helpers for BEM tests
 */
const assertions = {
  /**
   * Assert a value is truthy
   */
  ok: assert.ok,

  /**
   * Assert strict equality
   */
  equal: assert.strictEqual,

  /**
   * Assert deep equality
   */
  deepEqual: assert.deepStrictEqual,

  /**
   * Assert not equal
   */
  notEqual: assert.notStrictEqual,

  /**
   * Assert a value matches a regex
   * @param {string} value - Value to test
   * @param {RegExp} regex - Regular expression
   * @param {string} message - Error message
   */
  match(value, regex, message) {
    if (!regex.test(value)) {
      throw new Error(message || `Expected "${value}" to match ${regex}`);
    }
  },

  /**
   * Assert a value does not match a regex
   * @param {string} value - Value to test
   * @param {RegExp} regex - Regular expression
   * @param {string} message - Error message
   */
  notMatch(value, regex, message) {
    if (regex.test(value)) {
      throw new Error(message || `Expected "${value}" to not match ${regex}`);
    }
  },

  /**
   * Assert HTTP response has expected status code
   * @param {object} response - Response object from http-client
   * @param {number} expected - Expected status code
   * @param {string} message - Error message
   */
  statusCode(response, expected, message) {
    if (response.status !== expected) {
      throw new Error(message || `Expected status ${expected} but got ${response.status}`);
    }
  },

  /**
   * Assert response indicates success
   * @param {object} response - Response object from http-client
   * @param {string} message - Error message
   */
  isSuccess(response, message) {
    if (!response.success) {
      throw new Error(message || `Expected successful response but got error: ${response.error}`);
    }
  },

  /**
   * Assert response indicates error
   * @param {object} response - Response object from http-client
   * @param {number} expectedCode - Expected error code (optional)
   * @param {string} message - Error message
   */
  isError(response, expectedCode, message) {
    if (response.success) {
      throw new Error(message || `Expected error response but got success`);
    }
    if (expectedCode && response.status !== expectedCode) {
      throw new Error(message || `Expected error code ${expectedCode} but got ${response.status}`);
    }
  },

  /**
   * Assert object has a property
   * @param {object} obj - Object to check
   * @param {string} prop - Property name (supports dot notation)
   * @param {string} message - Error message
   */
  hasProperty(obj, prop, message) {
    const parts = prop.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined || !(part in current)) {
        throw new Error(message || `Expected object to have property "${prop}"`);
      }
      current = current[part];
    }
  },

  /**
   * Assert object property equals value
   * @param {object} obj - Object to check
   * @param {string} prop - Property name (supports dot notation)
   * @param {*} expected - Expected value
   * @param {string} message - Error message
   */
  propertyEquals(obj, prop, expected, message) {
    const parts = prop.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined || !(part in current)) {
        throw new Error(message || `Property "${prop}" not found`);
      }
      current = current[part];
    }

    if (current !== expected) {
      throw new Error(message || `Expected ${prop} to equal ${expected} but got ${current}`);
    }
  },

  /**
   * Assert value is of type
   * @param {*} value - Value to check
   * @param {string} type - Expected type ('string', 'number', 'object', 'array', etc.)
   * @param {string} message - Error message
   */
  isType(value, type, message) {
    let actual;

    if (type === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(message || `Expected array but got ${typeof value}`);
      }
      return;
    }

    actual = typeof value;
    if (actual !== type) {
      throw new Error(message || `Expected type "${type}" but got "${actual}"`);
    }
  },

  /**
   * Assert array contains value
   * @param {array} arr - Array to check
   * @param {*} value - Value to find
   * @param {string} message - Error message
   */
  contains(arr, value, message) {
    if (!Array.isArray(arr)) {
      throw new Error('First argument must be an array');
    }
    if (!arr.includes(value)) {
      throw new Error(message || `Expected array to contain ${value}`);
    }
  },

  /**
   * Assert value is within range
   * @param {number} value - Value to check
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @param {string} message - Error message
   */
  inRange(value, min, max, message) {
    if (value < min || value > max) {
      throw new Error(message || `Expected ${value} to be between ${min} and ${max}`);
    }
  },

  /**
   * Explicitly fail the test
   * @param {string} message - Error message
   */
  fail(message) {
    throw new Error(message || 'Test failed');
  },
};

module.exports = assertions;
