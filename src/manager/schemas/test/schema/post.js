/**
 * Comprehensive schema for testing all field types and options
 * Tests: types, default (static + function), value, min, max, required, clean
 */
module.exports = ({ user }) => {
  const planId = user?.plan?.id || 'basic';
  const isPremium = planId !== 'basic';

  const schema = {
    // Basic types
    stringField: {
      types: ['string'],
      default: 'default-string',
    },
    numberField: {
      types: ['number'],
      default: 42,
    },
    booleanField: {
      types: ['boolean'],
      default: false,
    },
    arrayField: {
      types: ['array'],
      default: ['a', 'b', 'c'],
    },
    objectField: {
      types: ['object'],
      default: { key: 'value' },
    },

    // Required fields
    requiredField: {
      types: ['string'],
      default: undefined,
      required: true,
    },
    conditionalRequired: {
      types: ['string'],
      default: undefined,
      required: () => isPremium, // Only required for premium users
    },

    // Function defaults
    functionDefault: {
      types: ['string'],
      default: () => `generated-${Date.now()}`,
    },
    userBasedDefault: {
      types: ['string'],
      default: user?.auth?.uid || 'anonymous',
    },

    // Forced value (overrides user input)
    forcedValue: {
      types: ['string'],
      default: 'ignored',
      value: 'always-this-value',
    },

    // Min/max for numbers
    minNumber: {
      types: ['number'],
      default: 5,
      min: 1,
    },
    maxNumber: {
      types: ['number'],
      default: 50,
      max: 100,
    },
    clampedNumber: {
      types: ['number'],
      default: 50,
      min: 10,
      max: 100,
    },

    // Min/max for strings (length)
    maxLengthString: {
      types: ['string'],
      default: '',
      max: 10,
    },

    // Min/max for arrays (length)
    maxLengthArray: {
      types: ['array'],
      default: [],
      max: 3,
    },

    // Plan-based limits
    planBasedLimit: {
      types: ['number'],
      default: 10,
      min: 1,
      max: isPremium ? 1000 : 100,
    },

    // Multiple allowed types
    multiType: {
      types: ['string', 'number'],
      default: 'default',
    },

    // Any type
    anyType: {
      types: ['any'],
      default: null,
    },

    // Clean with regex
    cleanedString: {
      types: ['string'],
      default: '',
      clean: /[^a-zA-Z0-9]/g, // Remove non-alphanumeric
    },

    // Clean with function
    cleanedFunction: {
      types: ['string'],
      default: '',
      clean: (value) => value.toLowerCase().trim(),
    },

    // Nested object (for completeness)
    nested: {
      level1: {
        types: ['string'],
        default: 'nested-default',
      },
    },
  };

  // Premium-only field (not available to basic users)
  if (isPremium) {
    schema.premiumOnlyField = {
      types: ['string'],
      default: 'premium-feature',
    };
  }

  return schema;
};
