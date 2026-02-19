/**
 * Test: POST /test/schema
 * Comprehensive schema validation tests
 * Tests all field types, options, and plan-based variations
 */
module.exports = {
  description: 'Schema validation',
  type: 'group',
  timeout: 30000,

  tests: [
    // ===================
    // BASIC TYPES
    // ===================
    {
      name: 'default-values-applied',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided', // Must provide required field
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // Check all defaults are applied
        assert.equal(settings.stringField, 'default-string', 'String default');
        assert.equal(settings.numberField, 42, 'Number default');
        assert.equal(settings.booleanField, false, 'Boolean default');
        assert.deepEqual(settings.arrayField, ['a', 'b', 'c'], 'Array default');
        // Note: Object defaults may include schema metadata due to powertools.defaults() behavior
        assert.equal(settings.objectField.key, 'value', 'Object default key');
      },
    },

    {
      name: 'user-values-override-defaults',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          stringField: 'custom-string',
          numberField: 100,
          booleanField: true,
          arrayField: ['x', 'y'],
          objectField: { custom: 'data' },
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.stringField, 'custom-string', 'String overridden');
        assert.equal(settings.numberField, 100, 'Number overridden');
        assert.equal(settings.booleanField, true, 'Boolean overridden');
        assert.deepEqual(settings.arrayField, ['x', 'y'], 'Array overridden');
        assert.equal(settings.objectField.custom, 'data', 'Object overridden');
      },
    },

    // ===================
    // REQUIRED FIELDS
    // ===================
    {
      name: 'required-field-missing-fails',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          // NOT providing requiredField
        });

        assert.isError(response, 400, 'Should fail with 400 for missing required field');
      },
    },

    {
      name: 'required-field-provided-succeeds',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'i-am-required',
        });

        assert.isSuccess(response, 'Should succeed when required field provided');
        assert.equal(response.data.settings.requiredField, 'i-am-required', 'Required field value');
      },
    },

    {
      name: 'conditional-required-basic-user',
      auth: 'basic',
      async run({ http, assert }) {
        // Basic user - conditionalRequired should NOT be required
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          // NOT providing conditionalRequired
        });

        assert.isSuccess(response, 'Basic user should succeed without conditionalRequired');
      },
    },

    {
      name: 'conditional-required-premium-user',
      auth: 'premium-active',
      async run({ http, assert }) {
        // Premium user - conditionalRequired SHOULD be required
        const response = await http.as('premium-active').post('test/schema', {
          requiredField: 'provided',
          // NOT providing conditionalRequired
        });

        assert.isError(response, 400, 'Premium user should fail without conditionalRequired');
      },
    },

    {
      name: 'conditional-required-premium-provided',
      auth: 'premium-active',
      async run({ http, assert }) {
        const response = await http.as('premium-active').post('test/schema', {
          requiredField: 'provided',
          conditionalRequired: 'also-provided',
        });

        assert.isSuccess(response, 'Premium user should succeed with conditionalRequired');
      },
    },

    // ===================
    // FUNCTION DEFAULTS
    // ===================
    {
      name: 'function-default-executed',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // functionDefault should be a generated string
        assert.match(settings.functionDefault, /^generated-\d+$/, 'Function default should be generated');
      },
    },

    {
      name: 'user-based-default-authenticated',
      async run({ http, assert, accounts }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // userBasedDefault should be the user's UID
        assert.equal(settings.userBasedDefault, accounts.basic.uid, 'User-based default should be UID');
      },
    },

    {
      name: 'user-based-default-unauthenticated',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('test/schema', {
          requiredField: 'provided',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // userBasedDefault should be 'anonymous' for unauthenticated users
        assert.equal(settings.userBasedDefault, 'anonymous', 'User-based default should be anonymous');
      },
    },

    // ===================
    // FORCED VALUE
    // ===================
    {
      name: 'forced-value-overrides-user-input',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          forcedValue: 'user-tried-to-set-this',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // forcedValue should always be the schema's value, not user input
        assert.equal(settings.forcedValue, 'always-this-value', 'Forced value should override user input');
      },
    },

    // ===================
    // MIN/MAX FOR NUMBERS
    // ===================
    {
      name: 'min-number-enforced',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          minNumber: -5, // Below min of 1
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // Should be clamped to min
        assert.equal(settings.minNumber, 1, 'Number should be clamped to min');
      },
    },

    {
      name: 'max-number-enforced',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          maxNumber: 500, // Above max of 100
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // Should be clamped to max
        assert.equal(settings.maxNumber, 100, 'Number should be clamped to max');
      },
    },

    {
      name: 'clamped-number-within-range',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          clampedNumber: 75, // Within range 10-100
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.clampedNumber, 75, 'Number within range should be unchanged');
      },
    },

    {
      name: 'clamped-number-below-range',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          clampedNumber: 5, // Below min of 10
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.clampedNumber, 10, 'Number should be clamped to min');
      },
    },

    {
      name: 'clamped-number-above-range',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          clampedNumber: 200, // Above max of 100
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.clampedNumber, 100, 'Number should be clamped to max');
      },
    },

    // ===================
    // MIN/MAX FOR STRINGS
    // ===================
    {
      name: 'max-length-string-truncated',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          maxLengthString: 'this-is-way-too-long-for-the-limit', // max is 10
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.maxLengthString.length, 10, 'String should be truncated to max length');
        assert.equal(settings.maxLengthString, 'this-is-wa', 'String should be truncated correctly');
      },
    },

    // ===================
    // MIN/MAX FOR ARRAYS
    // ===================
    {
      name: 'max-length-array-truncated',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          maxLengthArray: ['a', 'b', 'c', 'd', 'e'], // max is 3
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.maxLengthArray.length, 3, 'Array should be truncated to max length');
        assert.deepEqual(settings.maxLengthArray, ['a', 'b', 'c'], 'Array should be truncated correctly');
      },
    },

    // ===================
    // PLAN-BASED LIMITS
    // ===================
    {
      name: 'plan-based-limit-basic-user',
      auth: 'basic',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          planBasedLimit: 500, // Basic max is 100
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.planBasedLimit, 100, 'Basic user should be clamped to 100');
      },
    },

    {
      name: 'plan-based-limit-premium-user',
      auth: 'premium-active',
      async run({ http, assert }) {
        const response = await http.as('premium-active').post('test/schema', {
          requiredField: 'provided',
          conditionalRequired: 'provided', // Required for premium
          planBasedLimit: 500, // Premium max is 1000
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.planBasedLimit, 500, 'Premium user should allow 500');
      },
    },

    // ===================
    // MULTIPLE TYPES
    // ===================
    {
      name: 'multi-type-accepts-string',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          multiType: 'hello',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.multiType, 'hello', 'Should accept string');
        assert.isType(settings.multiType, 'string', 'Should be string type');
      },
    },

    {
      name: 'multi-type-accepts-number',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          multiType: 123,
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.multiType, 123, 'Should accept number');
        assert.isType(settings.multiType, 'number', 'Should be number type');
      },
    },

    // ===================
    // ANY TYPE
    // ===================
    {
      name: 'any-type-accepts-anything',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          anyType: { complex: { nested: ['data', 123, true] } },
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.deepEqual(settings.anyType, { complex: { nested: ['data', 123, true] } }, 'Should accept any type');
      },
    },

    // ===================
    // CLEAN (REGEX)
    // ===================
    {
      name: 'clean-regex-removes-characters',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          cleanedString: 'hello@world!123#test',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.cleanedString, 'helloworld123test', 'Non-alphanumeric should be removed');
      },
    },

    // ===================
    // CLEAN (FUNCTION)
    // ===================
    {
      name: 'clean-function-transforms-value',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          cleanedFunction: '  HELLO WORLD  ',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.cleanedFunction, 'hello world', 'Should be lowercased and trimmed');
      },
    },

    // ===================
    // NESTED OBJECTS
    // ===================
    {
      name: 'nested-defaults-applied',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.hasProperty(settings, 'nested.level1', 'Nested property should exist');
        assert.equal(settings.nested.level1, 'nested-default', 'Nested default should be applied');
      },
    },

    {
      name: 'nested-values-overridden',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          nested: {
            level1: 'custom-nested',
          },
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        assert.equal(settings.nested.level1, 'custom-nested', 'Nested value should be overridden');
      },
    },

    // ===================
    // UNAUTHENTICATED
    // ===================
    {
      name: 'unauthenticated-request',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('test/schema', {
          requiredField: 'provided',
        });

        assert.isSuccess(response, 'Unauthenticated request should succeed');

        const { user } = response.data;

        assert.equal(user.authenticated, false, 'Should be unauthenticated');
        assert.equal(user.subscription, 'basic', 'Should default to basic subscription');
      },
    },

    // ===================
    // AVAILABILITY
    // ===================
    {
      name: 'premium-only-field-basic-user',
      auth: 'basic',
      async run({ http, assert }) {
        const response = await http.as('basic').post('test/schema', {
          requiredField: 'provided',
          premiumOnlyField: 'trying-to-use-premium-feature',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // Basic user should NOT have access to premiumOnlyField
        assert.ok(!('premiumOnlyField' in settings), 'Basic user should not have premiumOnlyField');
      },
    },

    {
      name: 'premium-only-field-premium-user',
      auth: 'premium-active',
      async run({ http, assert }) {
        const response = await http.as('premium-active').post('test/schema', {
          requiredField: 'provided',
          conditionalRequired: 'provided',
          premiumOnlyField: 'using-premium-feature',
        });

        assert.isSuccess(response, 'Request should succeed');

        const { settings } = response.data;

        // Premium user SHOULD have access to premiumOnlyField
        assert.ok('premiumOnlyField' in settings, 'Premium user should have premiumOnlyField');
        assert.equal(settings.premiumOnlyField, 'using-premium-feature', 'Premium user can set value');
      },
    },
  ],
};
