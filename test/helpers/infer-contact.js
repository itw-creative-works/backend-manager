/**
 * Test: libraries/infer-contact.js
 * Unit tests for contact inference from email addresses
 *
 * Tests capitalize, inferContactFromEmail (regex), and inferContact (AI fallback).
 * AI tests only run when TEST_EXTENDED_MODE is set.
 */
const { inferContact, inferContactFromEmail, capitalize } = require('../../src/manager/libraries/infer-contact.js');

module.exports = {
  description: 'Infer contact from email',
  type: 'group',

  tests: [
    // ─── capitalize ───

    {
      name: 'capitalize-single-word',
      async run({ assert }) {
        assert.equal(capitalize('john'), 'John', 'Should capitalize first letter');
      },
    },

    {
      name: 'capitalize-multiple-words',
      async run({ assert }) {
        assert.equal(capitalize('john doe'), 'John Doe', 'Should capitalize each word');
      },
    },

    {
      name: 'capitalize-all-uppercase',
      async run({ assert }) {
        assert.equal(capitalize('JOHN'), 'John', 'Should lowercase after first letter');
      },
    },

    {
      name: 'capitalize-mixed-case',
      async run({ assert }) {
        assert.equal(capitalize('jOHN dOE'), 'John Doe', 'Should normalize mixed case');
      },
    },

    {
      name: 'capitalize-empty-string',
      async run({ assert }) {
        assert.equal(capitalize(''), '', 'Empty string should return empty');
      },
    },

    {
      name: 'capitalize-null',
      async run({ assert }) {
        assert.equal(capitalize(null), '', 'Null should return empty');
      },
    },

    {
      name: 'capitalize-undefined',
      async run({ assert }) {
        assert.equal(capitalize(undefined), '', 'Undefined should return empty');
      },
    },

    // ─── inferContactFromEmail: name parsing ───

    {
      name: 'regex-first-dot-last',
      async run({ assert }) {
        const result = inferContactFromEmail('john.doe@gmail.com');

        assert.equal(result.firstName, 'John', 'First name from local part before dot');
        assert.equal(result.lastName, 'Doe', 'Last name from local part after dot');
        assert.equal(result.method, 'regex', 'Method should be regex');
        assert.equal(result.confidence, 0.5, 'Two-part name should have 0.5 confidence');
      },
    },

    {
      name: 'regex-first-underscore-last',
      async run({ assert }) {
        const result = inferContactFromEmail('jane_smith@yahoo.com');

        assert.equal(result.firstName, 'Jane', 'First name from local part before underscore');
        assert.equal(result.lastName, 'Smith', 'Last name from local part after underscore');
      },
    },

    {
      name: 'regex-first-hyphen-last',
      async run({ assert }) {
        const result = inferContactFromEmail('bob-jones@hotmail.com');

        assert.equal(result.firstName, 'Bob', 'First name from local part before hyphen');
        assert.equal(result.lastName, 'Jones', 'Last name from local part after hyphen');
      },
    },

    {
      name: 'regex-three-part-name',
      async run({ assert }) {
        const result = inferContactFromEmail('mary.jane.watson@example.com');

        assert.equal(result.firstName, 'Mary', 'First name is first part');
        assert.equal(result.lastName, 'Jane Watson', 'Last name joins remaining parts');
      },
    },

    {
      name: 'regex-single-word-local-part',
      async run({ assert }) {
        const result = inferContactFromEmail('admin@example.com');

        assert.equal(result.firstName, 'Admin', 'Single word becomes first name');
        assert.equal(result.lastName, '', 'No last name for single word');
        assert.equal(result.confidence, 0.25, 'Single-part name should have 0.25 confidence');
      },
    },

    {
      name: 'regex-strips-trailing-numbers',
      async run({ assert }) {
        const result = inferContactFromEmail('john.doe42@gmail.com');

        assert.equal(result.firstName, 'John', 'Trailing numbers stripped before parsing');
        assert.equal(result.lastName, 'Doe', 'Name parsed correctly after stripping');
      },
    },

    {
      name: 'regex-only-numbers-after-name',
      async run({ assert }) {
        const result = inferContactFromEmail('user123@gmail.com');

        assert.equal(result.firstName, 'User', 'Numbers stripped, name capitalized');
        assert.equal(result.lastName, '', 'No last name');
      },
    },

    // ─── inferContactFromEmail: company inference ───

    {
      name: 'regex-company-from-custom-domain',
      async run({ assert }) {
        const result = inferContactFromEmail('john@acme.com');

        assert.equal(result.company, 'Acme', 'Company from custom domain');
      },
    },

    {
      name: 'regex-company-from-hyphenated-domain',
      async run({ assert }) {
        const result = inferContactFromEmail('john@my-company.com');

        assert.equal(result.company, 'My Company', 'Hyphens replaced with spaces');
      },
    },

    {
      name: 'regex-company-from-underscored-domain',
      async run({ assert }) {
        const result = inferContactFromEmail('john@my_company.com');

        assert.equal(result.company, 'My Company', 'Underscores replaced with spaces');
      },
    },

    {
      name: 'regex-no-company-from-gmail',
      async run({ assert }) {
        const result = inferContactFromEmail('john@gmail.com');

        assert.equal(result.company, '', 'Gmail is generic, no company');
      },
    },

    {
      name: 'regex-no-company-from-yahoo',
      async run({ assert }) {
        const result = inferContactFromEmail('john@yahoo.com');

        assert.equal(result.company, '', 'Yahoo is generic, no company');
      },
    },

    {
      name: 'regex-no-company-from-outlook',
      async run({ assert }) {
        const result = inferContactFromEmail('john@outlook.com');

        assert.equal(result.company, '', 'Outlook is generic, no company');
      },
    },

    {
      name: 'regex-no-company-from-protonmail',
      async run({ assert }) {
        const result = inferContactFromEmail('john@protonmail.com');

        assert.equal(result.company, '', 'Protonmail is generic, no company');
      },
    },

    {
      name: 'regex-no-company-from-icloud',
      async run({ assert }) {
        const result = inferContactFromEmail('john@icloud.com');

        assert.equal(result.company, '', 'iCloud is generic, no company');
      },
    },

    {
      name: 'regex-generic-domain-case-insensitive',
      async run({ assert }) {
        const result = inferContactFromEmail('john@GMAIL.COM');

        assert.equal(result.company, '', 'Generic domain check should be case-insensitive');
      },
    },

    // ─── inferContactFromEmail: combined name + company ───

    {
      name: 'regex-full-result-custom-domain',
      async run({ assert }) {
        const result = inferContactFromEmail('sarah.connor@skynet.io');

        assert.equal(result.firstName, 'Sarah', 'First name parsed');
        assert.equal(result.lastName, 'Connor', 'Last name parsed');
        assert.equal(result.company, 'Skynet', 'Company from domain');
        assert.equal(result.method, 'regex', 'Method is regex');
        assert.equal(result.confidence, 0.5, 'Confidence 0.5 for two-part name');
      },
    },

    {
      name: 'regex-single-name-custom-domain',
      async run({ assert }) {
        const result = inferContactFromEmail('info@acme.com');

        assert.equal(result.firstName, 'Info', 'Single word capitalized');
        assert.equal(result.lastName, '', 'No last name');
        assert.equal(result.company, 'Acme', 'Company inferred');
        assert.equal(result.confidence, 0.25, 'Lower confidence for single name');
      },
    },

    // ─── inferContact: regex fallback (no OPENAI_API_KEY) ───

    {
      name: 'infer-contact-regex-fallback',
      async run({ assert, skip }) {
        if (!process.env.TEST_EXTENDED_MODE || !process.env.BACKEND_MANAGER_OPENAI_API_KEY) {
          skip('TEST_EXTENDED_MODE or BACKEND_MANAGER_OPENAI_API_KEY not set');
        }

        const result = await inferContact('alice.wonderland@example.com');

        assert.equal(result.firstName, 'Alice', 'AI inferred first name');
        assert.equal(result.lastName, 'Wonderland', 'AI inferred last name');
        assert.ok(result.method === 'ai', 'Should use AI');
      },
    },

    // ─── inferContact: AI path (requires TEST_EXTENDED_MODE) ───

    {
      name: 'infer-contact-ai',
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set (skipping AI inference test)' : false,
      timeout: 30000,

      async run({ assert, Manager }) {
        // This test requires a real OPENAI_API_KEY and running Manager
        if (!process.env.OPENAI_API_KEY) {
          return assert.fail('OPENAI_API_KEY not set');
        }

        const assistant = Manager.Assistant();
        const result = await inferContact('john.smith@microsoft.com', assistant);

        assert.ok(result, 'Should return a result');
        assert.ok(result.firstName, 'Should infer a first name');
        assert.equal(result.method, 'ai', 'Should use AI method');
        assert.ok(typeof result.confidence === 'number', 'Confidence should be a number');
      },
    },
  ],
};
