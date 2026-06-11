/**
 * Test: Email validation library (libraries/email/validation.js)
 * Unit tests for format, local part, disposable domain, corporate domain, typo domain, DNS, and mailbox checks
 *
 * Format, local part, disposable, corporate, and typo tests always run (free, sync, offline-safe).
 * DNS negative tests require TEST_EXTENDED_MODE (live DNS resolution).
 * Mailbox verification tests require TEST_EXTENDED_MODE + NEVERBOUNCE_API_KEY or ZEROBOUNCE_API_KEY.
 */
const { validate, isDisposable, isCorporate, DEFAULT_CHECKS, ALL_CHECKS } = require('../../src/manager/libraries/email/validation.js');

const HAS_MAILBOX_API_KEY = !!(process.env.NEVERBOUNCE_API_KEY || process.env.ZEROBOUNCE_API_KEY);

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
      name: 'localpart-admin-allowed',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('admin@company.com');

        assert.equal(result.valid, true, '"admin" local part should be allowed (team/role address)');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'localPart check should pass');
      },
    },

    {
      name: 'localpart-all-numeric-allowed',
      timeout: 5000,

      async run({ assert }) {
        // All-numeric local parts are legitimate (QQ emails like 1549482839@qq.com,
        // student IDs) — the ^\d+$ pattern was removed in v5.5.6 after NeverBounce
        // confirmed real users were being blocked.
        const result = await validate('123456@gmail.com');

        assert.equal(result.valid, true, 'All-numeric local part should be allowed');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'localPart check should pass');
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
      name: 'localpart-letter-plus-numbers-allowed',
      timeout: 5000,

      async run({ assert }) {
        // Short letter + numbers local parts are legitimate (real Gmail users like
        // mi1925973, hk9526802) — the ^[a-z]{1,2}\d+$ pattern was removed in v5.5.6
        // after NeverBounce confirmed real users were being blocked.
        const result = await validate('a123@gmail.com');

        assert.equal(result.valid, true, 'Single letter + numbers should be allowed');
        assert.propertyEquals(result, 'checks.localPart.valid', true, 'localPart check should pass');
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

    // --- Corporate / social-media domain checks ---

    {
      name: 'corporate-meta-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('ian@meta.com');

        assert.equal(result.valid, false, 'meta.com should be blocked');
        assert.propertyEquals(result, 'checks.corporate.blocked', true, 'Should be flagged as blocked');
        assert.propertyEquals(result, 'checks.corporate.domain', 'meta.com', 'Should include blocked domain');
        assert.propertyEquals(result, 'checks.corporate.reason', 'Corporate/social-media domain', 'Should have human-readable reason');
      },
    },

    {
      name: 'corporate-instagram-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@instagram.com');

        assert.equal(result.valid, false, 'instagram.com should be blocked');
        assert.propertyEquals(result, 'checks.corporate.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'corporate-soundcloud-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('user@soundcloud.com');

        assert.equal(result.valid, false, 'soundcloud.com should be blocked');
        assert.propertyEquals(result, 'checks.corporate.blocked', true, 'Should be flagged as blocked');
      },
    },

    {
      name: 'corporate-gmail-allowed',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.com');

        assert.equal(result.valid, true, 'gmail.com should NOT be flagged as corporate');
        assert.propertyEquals(result, 'checks.corporate.valid', true, 'Corporate check should pass');
        assert.propertyEquals(result, 'checks.corporate.blocked', false, 'Should not be blocked');
      },
    },

    {
      name: 'corporate-runs-before-localpart',
      timeout: 5000,

      async run({ assert }) {
        // "test@meta.com" would be blocked by BOTH corporate and localPart;
        // corporate runs first, so we should see corporate (not localPart) in the result.
        const result = await validate('test@meta.com');

        assert.equal(result.valid, false, 'Should be blocked');
        assert.propertyEquals(result, 'checks.corporate.blocked', true, 'Corporate should be the failure reason');
        assert.equal(result.checks.localPart, undefined, 'localPart should not run after corporate fails');
      },
    },

    {
      name: 'corporate-can-be-skipped-via-checks-option',
      timeout: 5000,

      async run({ assert }) {
        // Allow a caller to bypass the corporate check (e.g., during signup, where Meta employees are real users)
        const result = await validate('ian@meta.com', { checks: ['format', 'disposable', 'localPart'] });

        assert.equal(result.valid, true, 'Without corporate check, meta.com should pass');
        assert.equal(result.checks.corporate, undefined, 'corporate should not run');
      },
    },

    // --- Typo domain checks ---

    {
      name: 'typo-gamil-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gamil.com');

        assert.equal(result.valid, false, 'gamil.com should be blocked as a typo of gmail.com');
        assert.propertyEquals(result, 'checks.typo.valid', false, 'Typo check should fail');
        assert.propertyEquals(result, 'checks.typo.matchedPrefix', 'gamil.', 'Should report the matched prefix');
        assert.propertyEquals(result, 'checks.typo.reason', 'Likely misspelled domain', 'Should have human-readable reason');
      },
    },

    {
      name: 'typo-gmail-con-blocked',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.con');

        assert.equal(result.valid, false, 'gmail.con should be blocked as a typo TLD');
        assert.propertyEquals(result, 'checks.typo.valid', false, 'Typo check should fail');
      },
    },

    {
      name: 'typo-correct-domains-pass',
      timeout: 5000,

      async run({ assert }) {
        const gmail = await validate('rachel.greene@gmail.com');
        const hotmail = await validate('rachel.greene@hotmail.com');

        assert.equal(gmail.valid, true, 'gmail.com should pass');
        assert.propertyEquals(gmail, 'checks.typo.valid', true, 'Typo check should pass for gmail.com');
        assert.equal(hotmail.valid, true, 'hotmail.com should pass');
        assert.propertyEquals(hotmail, 'checks.typo.valid', true, 'Typo check should pass for hotmail.com');
      },
    },

    // --- isCorporate helper ---

    {
      name: 'isCorporate-social-domain-detected',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isCorporate('user@meta.com'), true, 'meta.com should be corporate');
        assert.equal(isCorporate('user@instagram.com'), true, 'instagram.com should be corporate');
        assert.equal(isCorporate('user@soundcloud.com'), true, 'soundcloud.com should be corporate');
        assert.equal(isCorporate('user@tiktok.com'), true, 'tiktok.com should be corporate');
        assert.equal(isCorporate('user@linkedin.com'), true, 'linkedin.com should be corporate');
      },
    },

    {
      name: 'isCorporate-legitimate-domain-passes',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isCorporate('user@gmail.com'), false, 'gmail.com should not be corporate');
        assert.equal(isCorporate('user@somiibo.com'), false, 'Custom domain should not be corporate');
        assert.equal(isCorporate('user@mailinator.com'), false, 'Disposable is a separate category');
      },
    },

    {
      name: 'isCorporate-accepts-domain-only',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isCorporate('meta.com'), true, 'Should work with bare domain');
        assert.equal(isCorporate('gmail.com'), false, 'Should work with bare domain');
      },
    },

    {
      name: 'isCorporate-handles-edge-cases',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isCorporate(''), false, 'Empty string should return false');
        assert.equal(isCorporate(null), false, 'Null should return false');
        assert.equal(isCorporate(undefined), false, 'Undefined should return false');
      },
    },

    {
      name: 'isCorporate-case-insensitive',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isCorporate('user@META.COM'), true, 'Should be case-insensitive');
        assert.equal(isCorporate('USER@Instagram.Com'), true, 'Should be case-insensitive');
      },
    },

    // --- isDisposable helper ---

    {
      name: 'isDisposable-vendor-domain-detected',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isDisposable('user@mailinator.com'), true, 'mailinator.com should be disposable');
        assert.equal(isDisposable('user@guerrillamail.com'), true, 'guerrillamail.com should be disposable');
      },
    },

    {
      name: 'isDisposable-custom-domain-detected',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isDisposable('user@sharebot.net'), true, 'Custom list domain should be disposable');
        assert.equal(isDisposable('user@pickmemail.com'), true, 'Custom list domain should be disposable');
      },
    },

    {
      name: 'isDisposable-legitimate-domain-passes',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isDisposable('user@gmail.com'), false, 'gmail.com should not be disposable');
        assert.equal(isDisposable('user@somiibo.com'), false, 'Custom domain should not be disposable');
      },
    },

    {
      name: 'isDisposable-accepts-domain-only',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isDisposable('mailinator.com'), true, 'Should work with bare domain');
        assert.equal(isDisposable('gmail.com'), false, 'Should work with bare domain');
      },
    },

    {
      name: 'isDisposable-handles-edge-cases',
      timeout: 5000,

      async run({ assert }) {
        assert.equal(isDisposable(''), false, 'Empty string should return false');
        assert.equal(isDisposable(null), false, 'Null should return false');
        assert.equal(isDisposable(undefined), false, 'Undefined should return false');
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
        assert.deepEqual(DEFAULT_CHECKS, ['format', 'disposable', 'corporate', 'localPart', 'typo'], 'DEFAULT_CHECKS should be all free sync checks (no dns/mailbox)');
        assert.deepEqual(ALL_CHECKS, ['format', 'disposable', 'corporate', 'localPart', 'typo', 'dns', 'mailbox'], 'ALL_CHECKS should add dns + mailbox');
      },
    },

    // --- DNS check behavior ---

    {
      name: 'dns-not-in-default-checks',
      timeout: 5000,

      async run({ assert }) {
        const result = await validate('rachel.greene@gmail.com');

        assert.equal(result.valid, true, 'Should be valid');
        assert.equal(result.checks.dns, undefined, 'DNS should not run with default checks (async/slow — opt-in)');
      },
    },

    {
      name: 'dns-valid-domain-passes',
      timeout: 15000,

      async run({ assert }) {
        // Offline-safe: on network errors the dns check is skipped (valid stays true);
        // only definitive no-MX/NXDOMAIN answers block.
        const result = await validate('rachel.greene@gmail.com', { checks: ['format', 'dns'] });

        assert.equal(result.valid, true, 'gmail.com should pass the DNS check');
        assert.hasProperty(result, 'checks.dns', 'Should have dns check result');
      },
    },

    {
      name: 'dns-nonexistent-domain-fails',
      timeout: 15000,
      skip: !process.env.TEST_EXTENDED_MODE
        ? 'TEST_EXTENDED_MODE not set (requires live DNS resolution)'
        : false,

      async run({ assert }) {
        const result = await validate('rachel.greene@thisdomaindoesnotexist99887766.com', { checks: ['format', 'dns'] });

        assert.equal(result.valid, false, 'Nonexistent domain should fail the DNS check');
        assert.propertyEquals(result, 'checks.dns.valid', false, 'DNS check should fail');
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
        const originalNB = process.env.NEVERBOUNCE_API_KEY;
        const originalZB = process.env.ZEROBOUNCE_API_KEY;
        delete process.env.NEVERBOUNCE_API_KEY;
        delete process.env.ZEROBOUNCE_API_KEY;

        try {
          const result = await validate('rachel.greene@gmail.com', { checks: ALL_CHECKS });

          assert.equal(result.valid, true, 'Should still be valid');
          assert.hasProperty(result, 'checks.mailbox', 'Should have mailbox check');
          assert.propertyEquals(result, 'checks.mailbox.skipped', true, 'Should be marked as skipped');
        } finally {
          if (originalNB) {
            process.env.NEVERBOUNCE_API_KEY = originalNB;
          }
          if (originalZB) {
            process.env.ZEROBOUNCE_API_KEY = originalZB;
          }
        }
      },
    },

    // --- Mailbox verification API checks (require TEST_EXTENDED_MODE + mailbox API key) ---

    {
      name: 'mailbox-valid-email-passes',
      timeout: 15000,
      skip: !process.env.TEST_EXTENDED_MODE || !HAS_MAILBOX_API_KEY
        ? 'TEST_EXTENDED_MODE or mailbox API key not set'
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
      skip: !process.env.TEST_EXTENDED_MODE || !HAS_MAILBOX_API_KEY
        ? 'TEST_EXTENDED_MODE or mailbox API key not set'
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
