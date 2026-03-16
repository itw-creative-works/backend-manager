/**
 * Test: Email validation library (libraries/email/validation.js)
 * Unit tests for format, local part, disposable domain, and ZeroBounce checks
 *
 * Format, local part, and disposable tests always run (free, regex-based).
 * Mailbox verification tests require TEST_EXTENDED_MODE + ZEROBOUNCE_API_KEY.
 */
const { validate, DEFAULT_CHECKS, ALL_CHECKS } = require('../../src/manager/libraries/email/validation.js');

module.exports = {
  description: 'Email validation',
  type: 'group',
  tests: [
    // --- Format checks ---

    {
      name: 'format-valid-email-passes',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.com');

        assert.equal(result.valid, true, 'Valid email should pass');
        assert.propertyEquals(result, 'checks.format.valid', true, 'Format check should pass');
      },
    },

    {
      name: 'format-no-at-sign-fails',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('not-a-valid-email');

        assert.equal(result.valid, false, 'Missing @ should fail');
        assert.propertyEquals(result, 'checks.format.valid', false, 'Format check should fail');
      },
    },

    {
      name: 'format-no-domain-fails',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('user@');

        assert.equal(result.valid, false, 'Missing domain should fail');
        assert.propertyEquals(result, 'checks.format.valid', false, 'Format check should fail');
      },
    },

    {
      name: 'format-empty-string-fails',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('');

        assert.equal(result.valid, false, 'Empty string should fail');
        assert.propertyEquals(result, 'checks.format.valid', false, 'Format check should fail');
      },
    },

    {
      name: 'format-spaces-fails',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('user name@gmail.com');

        assert.equal(result.valid, false, 'Spaces should fail');
        assert.propertyEquals(result, 'checks.format.valid', false, 'Format check should fail');
      },
    },

    // --- Local part checks ---

    {
      name: 'localpart-test-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('test@gmail.com');

        assert.equal(result.valid, false, '"test" local part should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
        assert.propertyEquals(result, 'checks.localPart.localPart', 'test', 'Should include the local part');
      },
    },

    {
      name: 'localpart-noreply-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('noreply@company.com');

        assert.equal(result.valid, false, '"noreply" local part should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-admin-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('admin@company.com');

        assert.equal(result.valid, false, '"admin" local part should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-all-numeric-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('123456@gmail.com');

        assert.equal(result.valid, false, 'All-numeric local part should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
        assert.propertyEquals(result, 'checks.localPart.reason', 'Matches junk pattern', 'Should match junk pattern');
      },
    },

    {
      name: 'localpart-repeating-chars-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('aaaa@gmail.com');

        assert.equal(result.valid, false, 'Repeating chars should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-keyboard-walk-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('asdf@gmail.com');

        assert.equal(result.valid, false, 'Keyboard walk should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-test-prefix-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('test.user@gmail.com');

        assert.equal(result.valid, false, '"test." prefix should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-letter-plus-numbers-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('a123@gmail.com');

        assert.equal(result.valid, false, 'Single letter + numbers should be blocked');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'localpart-plus-suffix-stripped-before-check',
      timeout: 5000,

      async run({ assert }) {
        // "test+something" → strips to "test" → blocked
        const result = await validate('test+newsletter@gmail.com');

        assert.equal(result.valid, false, '"test+suffix" should still be blocked (strips +suffix first)');
        assert.propertyEquals(result, 'checks.localPart.blocked', true, 'Should be blocked after stripping suffix');
      },
    },

    {
      name: 'localpart-bem-suffix-allowed-on-real-names',
      timeout: 5000,

      async run({ assert }) {
        // "rachel.greene+bem" → strips to "rachel.greene" → allowed
        const result = await validate('rachel.greene+bem@gmail.com');

        assert.equal(result.valid, true, 'Real name with +bem suffix should pass');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'Local part check should pass');
      },
    },

    {
      name: 'localpart-real-name-passes',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('john.smith@company.com');

        assert.equal(result.valid, true, 'Real name should pass');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'Local part check should pass');
      },
    },

    {
      name: 'localpart-single-real-name-passes',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel@company.com');

        assert.equal(result.valid, true, 'Single real name should pass');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'Local part check should pass');
      },
    },

    // --- Disposable domain checks ---

    {
      name: 'disposable-mailinator-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@mailinator.com');

        assert.equal(result.valid, false, 'Mailinator should be invalid');
        assert.propertyEquals(result, 'checks.disposable.blocked', true, 'Should be flagged as blocked');
        assert.propertyEquals(result, 'checks.disposable.domain', 'mailinator.com', 'Should include blocked domain');
      },
    },

    {
      name: 'disposable-guerrillamail-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@guerrillamail.com');

        assert.equal(result.valid, false, 'GuerrillaMail should be invalid');
        assert.propertyEquals(result, 'checks.disposable.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'disposable-tempmail-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@temp-mail.org');

        assert.equal(result.valid, false, 'temp-mail.org should be invalid');
        assert.propertyEquals(result, 'checks.disposable.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'valid-gmail-passes-disposable',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.com');

        assert.equal(result.valid, true, 'Gmail should be valid');
        assert.propertyEquals(result, 'checks.disposable.valid', true, 'Should pass disposable check');
        assert.propertyEquals(result, 'checks.disposable.blocked', false, 'Should not be blocked');
      },
    },

    {
      name: 'valid-custom-domain-passes',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('ian@somiibo.com');

        assert.equal(result.valid, true, 'Custom domain should be valid');
        assert.propertyEquals(result, 'checks.disposable.valid', true, 'Should pass disposable check');
      },
    },

    // --- Selective checks ---

    {
      name: 'checks-format-only',
      timeout: 5000,

      async run({ assert }) {
        // "test@gmail.com" normally blocked by localPart, but only running format
        const result = await validate('test@gmail.com', { checks: ['format'] });

        assert.equal(result.valid, true, 'Should pass with only format check');
        assert.propertyEquals(result, 'checks.format.valid', true, 'Format should pass');
        assert.equal(result.checks.localPart, undefined, 'localPart should not run');
        assert.equal(result.checks.disposable, undefined, 'disposable should not run');
      },
    },

    {
      name: 'checks-format-and-disposable-skips-localpart',
      timeout: 5000,

      async run({ assert }) {
        // "test@gmail.com" would be blocked by localPart, but we only run format + disposable
        const result = await validate('test@gmail.com', { checks: ['format', 'disposable'] });

        assert.equal(result.valid, true, 'Should pass without localPart check');
        assert.propertyEquals(result, 'checks.format.valid', true, 'Format should pass');
        assert.propertyEquals(result, 'checks.disposable.blocked', false, 'Disposable should pass');
        assert.equal(result.checks.localPart, undefined, 'localPart should not run');
      },
    },

    {
      name: 'checks-format-and-disposable-still-blocks-disposable',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@mailinator.com', { checks: ['format', 'disposable'] });

        assert.equal(result.valid, false, 'Disposable should still fail');
        assert.propertyEquals(result, 'checks.disposable.blocked', true, 'Should be blocked');
      },
    },

    {
      name: 'checks-default-matches-expected',
      timeout: 5000,

      async run({ assert }) {
        assert.deepEqual(DEFAULT_CHECKS, ['format', 'disposable', 'localPart'], 'DEFAULT_CHECKS should be format + disposable + localPart');
        assert.deepEqual(ALL_CHECKS, ['format', 'disposable', 'localPart', 'mailbox'], 'ALL_CHECKS should include mailbox');
      },
    },

    // --- Mailbox verification behavior ---

    {
      name: 'mailbox-not-in-default-checks',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.com');

        assert.equal(result.valid, true, 'Should be valid');
        assert.equal(result.checks.mailbox, undefined, 'Mailbox should not run with default checks');
      },
    },

    {
      name: 'mailbox-skipped-without-api-key',
      timeout: 5000,

      async run({ assert }) {
        const originalKey = process.env.ZEROBOUNCE_API_KEY;
        delete process.env.ZEROBOUNCE_API_KEY;

        try {
          const result = await validate('rachel.greene@gmail.com', { checks: ALL_CHECKS });

          assert.equal(result.valid, true, 'Should still be valid');
          assert.hasProperty(result, 'checks.mailbox', 'Should have mailbox check');
          assert.propertyEquals(result, 'checks.mailbox.skipped', true, 'Should be marked as skipped');
        } finally {
          if (originalKey) {
            process.env.ZEROBOUNCE_API_KEY = originalKey;
          }
        }
      },
    },

    // --- Mailbox verification API checks (require TEST_EXTENDED_MODE + ZEROBOUNCE_API_KEY) ---

    {
      name: 'mailbox-valid-email-passes',
      timeout: 15000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ assert, skip }) {
        const result = await validate('disposable@gmail.com', { checks: ALL_CHECKS });

        if (result.checks.mailbox?.error?.includes('out of credits')) {
          skip('Mailbox verification out of credits');
        }

        assert.hasProperty(result, 'checks.mailbox', 'Should have mailbox check');
        assert.hasProperty(result, 'checks.mailbox.status', 'Should have status');
      },
    },

    {
      name: 'mailbox-fake-domain-fails',
      timeout: 15000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ assert, skip }) {
        const result = await validate('rachel.greene@thisfakedomain99999.com', { checks: ALL_CHECKS });

        if (result.checks.mailbox?.error?.includes('out of credits')) {
          skip('Mailbox verification out of credits');
        }

        assert.hasProperty(result, 'checks.mailbox.status', 'Should have status');
        assert.notEqual(result.checks.mailbox.status, 'valid', 'Fake domain should not be valid');
      },
    },
  ],
};
