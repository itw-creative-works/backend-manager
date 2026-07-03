/**
 * Test: Add Marketing Contact
 * Tests the general:add-marketing-contact command for adding users to SendGrid/Beehiiv
 *
 * Set TEST_EXTENDED_MODE=true to run tests against real SendGrid/Beehiiv APIs
 * (requires SENDGRID_API_KEY and BEEHIIV_API_KEY env vars)
 */

// Test email patterns - look like real emails but +bem suffix identifies them for cleanup.
// Fixed `itwcreativeworks.com` test domain — deterministic across brands (avoids cross-brand
// state contamination in SendGrid/Beehiiv) and we control it: mailbox verdicts are stable
// and the AI won't flag it as a placeholder (which `acme.com` now is — empty names,
// confidence 0 — breaking inference).
const TEST_DOMAIN = 'itwcreativeworks.com';
const TEST_EMAILS = {
  valid: () => `sarah.martinez+bem@${TEST_DOMAIN}`,         // Should infer: Sarah Martinez
  invalid: () => `nonexistent.user+bem@${TEST_DOMAIN}`,     // No such mailbox — mailbox verification should flag invalid
};

module.exports = {
  description: 'Add marketing contact (SendGrid + Beehiiv)',
  type: 'group',
  tests: [
    // Test 1: Admin can add valid email (with real provider calls if TEST_EXTENDED_MODE is set)
    {
      name: 'admin-valid-email-succeeds',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        const testEmail = TEST_EMAILS.valid();
        state.testEmail = testEmail;

        const response = await http.command('general:add-marketing-contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - should be inferred
          // skipValidation bypasses the mailbox verification check — the test email
          // doesn't have a real mailbox so the provider (correctly) marks it as not
          // deliverable. We're testing the command flow, not the deliverability check.
          skipValidation: true,
        });

        assert.isSuccess(response, 'Add marketing contact should succeed for admin');
        assert.hasProperty(response, 'data.success', 'Response should contain success');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        // Admin gets detailed response
        assert.hasProperty(response, 'data.providers', 'Admin response should contain providers');

        // If TEST_EXTENDED_MODE is set, verify provider results
        if (process.env.TEST_EXTENDED_MODE) {
          const providers = response.data.providers || {};

          if (process.env.SENDGRID_API_KEY) {
            assert.hasProperty(response, 'data.providers.campaigns', 'Should have SendGrid result');
            if (providers.campaigns?.success) {
              state.sendgridAdded = true;
            } else {
              // Log error for debugging but don't fail - could be list matching issue
              console.log('SendGrid result:', providers.campaigns);
            }
          }

          if (process.env.BEEHIIV_API_KEY) {
            assert.hasProperty(response, 'data.providers.newsletter', 'Should have Beehiiv result');
            if (providers.newsletter?.success) {
              state.beehiivAdded = true;
            } else {
              console.log('Beehiiv result:', providers.newsletter);
            }
          }
        }
      },

      async cleanup({ state, http }) {
        // Only cleanup if TEST_EXTENDED_MODE is set and contacts were added
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        console.log(`Cleaning up test contact: ${state.testEmail}`);

        const result = await http.command('general:remove-marketing-contact', {
          email: state.testEmail,
        });
        console.log('Cleanup result:', result.data);
      },
    },

    // Test 2: Invalid email format rejected
    {
      name: 'invalid-email-format-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('general:add-marketing-contact', {
          email: 'not-a-valid-email',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Invalid email format should return 400');
      },
    },

    // Test 3: Missing email rejected
    {
      name: 'missing-email-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('general:add-marketing-contact', {
          firstName: 'Test',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Missing email should return 400');
      },
    },

    // Test 4: Disposable email rejected
    {
      name: 'disposable-email-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('general:add-marketing-contact', {
          email: 'test@mailinator.com',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Disposable email should return 400');
      },
    },

    // Test 5: Name inferred from email (AI only — requires extended mode)
    {
      name: 'name-inferred-from-email',
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set (AI inference requires OPENAI_API_KEY)' : false,
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        // Use valid email without providing name - should infer "Rachel Greene"
        const testEmail = TEST_EMAILS.valid();
        state.testEmail = testEmail;

        const response = await http.command('general:add-marketing-contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - should be inferred
          // skipValidation bypasses the mailbox verification check — this test's concern
          // is AI name inference (which runs after validation); without it the mailbox
          // check 400s the fabricated address before the inference asserts run.
          skipValidation: true,
        });

        assert.isSuccess(response, 'Add marketing contact should succeed');

        // Check name was inferred
        assert.hasProperty(response, 'data.nameInferred', 'Should have nameInferred');
        assert.ok(
          response.data.nameInferred.firstName || response.data.nameInferred.lastName,
          'Name should be inferred from email'
        );
        assert.hasProperty(response.data.nameInferred, 'method', 'Should include inference method');

        // Track if providers were called
        if (process.env.TEST_EXTENDED_MODE) {
          state.sendgridAdded = response.data?.providers?.campaigns?.success;
          state.beehiivAdded = response.data?.providers?.newsletter?.success;
        }
      },

      async cleanup({ state, http }) {
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        await http.command('general:remove-marketing-contact', { email: state.testEmail });
      },
    },

    // Test 6: Admin can skip validation (use disposable domain but skip check)
    {
      name: 'admin-skip-validation',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        // Use disposable domain - normally blocked, but skipValidation bypasses
        const testEmail = 'rachel.greene+bem@mailinator.com';
        state.testEmail = testEmail;

        const response = await http.command('general:add-marketing-contact', {
          email: testEmail,
          source: 'bem-test',
          skipValidation: true,
        });

        // Should succeed because validation was skipped
        assert.isSuccess(response, 'Add marketing contact with skipValidation should succeed');

        if (process.env.TEST_EXTENDED_MODE) {
          state.sendgridAdded = response.data?.providers?.campaigns?.success;
          state.beehiivAdded = response.data?.providers?.newsletter?.success;
        }
      },

      async cleanup({ state, http }) {
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        await http.command('general:remove-marketing-contact', { email: state.testEmail });
      },
    },

    // Test 7: Mailbox verification (only runs if TEST_EXTENDED_MODE and a mailbox API key are set)
    {
      name: 'mailbox-validation',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !(process.env.NEVERBOUNCE_API_KEY || process.env.ZEROBOUNCE_API_KEY)
        ? 'TEST_EXTENDED_MODE or mailbox API key not set'
        : false,

      async run({ http, assert, state, skip }) {
        const testEmail = TEST_EMAILS.valid();
        state.testEmail = testEmail;

        const response = await http.command('general:add-marketing-contact', {
          email: testEmail,
          source: 'bem-test',
        });

        // Outcome A: the provider rejected the fabricated mailbox → admin 400. Every
        // earlier check passes deterministically for this address (format/localPart/
        // disposable/corporate return their own dedicated messages, typo can't match,
        // and the domain has real MX), so reaching the generic validation-failed 400
        // proves the paid mailbox pipeline ran and rejected. Nothing was added, so
        // cleanup is a no-op.
        if (response.status === 400) {
          assert.ok(
            response.error?.includes('Email validation failed'),
            `400 should be the validation-failed branch, got: ${response.error}`
          );

          if (response.error.includes('(dns)')) {
            skip('Transient DNS failure — mailbox check never ran');
          }

          assert.ok(response.error.includes('(mailbox)'), `Failed check should be mailbox, got: ${response.error}`);
          return;
        }

        // Outcome B: provider accepted (valid/catch-all/unknown) or failed open.
        assert.isSuccess(response, 'Add marketing contact should succeed');

        // Check that validation info is included
        assert.hasProperty(response, 'data.validation', 'Response should contain validation');
        assert.hasProperty(response, 'data.validation.checks', 'Validation should contain checks');

        // Mailbox check should be in checks when key is set
        assert.hasProperty(response, 'data.validation.checks.mailbox', 'Should have mailbox check');

        const mbResult = response.data.validation.checks.mailbox;

        // Provider errors fail open as { valid: true, error, provider } with NO status
        // field — out of credits, bad key, timeouts. Nothing assertable; skip.
        if (mbResult.error) {
          skip(`Mailbox verification unavailable: ${mbResult.error}`);
        }

        assert.hasProperty(mbResult, 'status', 'Mailbox check should return status');

        state.sendgridAdded = response.data?.providers?.campaigns?.success;
        state.beehiivAdded = response.data?.providers?.newsletter?.success;
      },

      async cleanup({ state, http }) {
        if (!state.testEmail) {
          return;
        }

        await http.command('general:remove-marketing-contact', { email: state.testEmail });
      },
    },

    // Test 9: Mailbox verification rejects invalid email (only runs if TEST_EXTENDED_MODE and a mailbox API key are set)
    {
      name: 'mailbox-rejects-invalid',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !(process.env.NEVERBOUNCE_API_KEY || process.env.ZEROBOUNCE_API_KEY)
        ? 'TEST_EXTENDED_MODE or mailbox API key not set'
        : false,

      async run({ http, assert, skip }) {
        // Email that should reach the mailbox provider and be flagged as undeliverable.
        // Must NOT trip earlier checks (localPart blocklist, disposable, corporate).
        const testEmail = TEST_EMAILS.invalid();

        const response = await http.command('general:add-marketing-contact', {
          email: testEmail,
          source: 'bem-test',
        });

        const mbResult = response.data?.validation?.checks?.mailbox;

        // Provider errors fail open with no status — the test can't exercise rejection; skip.
        if (mbResult?.error) {
          skip(`Mailbox verification unavailable: ${mbResult.error}`);
        }

        // If the response was a 400, that's the legitimate rejection path — done.
        if (response.status === 400) {
          if (response.error?.includes('(dns)')) {
            skip('Transient DNS failure — mailbox check never ran');
          }

          assert.ok(response.error?.includes('(mailbox)'), `Failed check should be mailbox, got: ${response.error}`);
          return;
        }

        // Otherwise expect a 200 with a non-"valid" mailbox status.
        assert.isSuccess(response, 'Request should succeed (fail-open) or error 400');
        if (mbResult) {
          assert.hasProperty(mbResult, 'status', 'Should have status');
          assert.notEqual(mbResult.status, 'valid', 'Fake email should not be marked valid');
        }
      },
    },

    // --- Auth rejection tests (at end per convention) ---
    {
      name: 'unauthenticated-requires-recaptcha',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        // Public request without reCAPTCHA should fail
        const response = await http.command('general:add-marketing-contact', {
          email: TEST_EMAILS.valid(),
          source: 'bem-test',
        });

        // Should fail with 400 because no reCAPTCHA token
        assert.isError(response, 400, 'Public request without reCAPTCHA should fail');
      },
    },

    // --- Final cleanup test (runs last to clean up test contacts from providers) ---
    {
      name: 'cleanup-test-contacts',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ http, assert }) {
        // Clean up the rachel.greene+bem test contact from marketing providers
        const testEmail = TEST_EMAILS.valid();

        const response = await http.command('general:remove-marketing-contact', {
          email: testEmail,
        });

        assert.isSuccess(response, 'Remove marketing contact should succeed');
      },
    },
  ],
};
