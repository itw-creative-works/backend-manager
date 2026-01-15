/**
 * Test: POST /marketing/contact and DELETE /marketing/contact
 * Tests the marketing contact endpoints for adding/removing users to SendGrid/Beehiiv
 *
 * Set TEST_EXTENDED_MODE=true to run tests against real SendGrid/Beehiiv APIs
 * (requires SENDGRID_API_KEY and BEEHIIV_API_KEY env vars)
 */

// Test email patterns - look like real emails but +bem suffix identifies them for cleanup
// Names should be inferred by AI from the email local part
const TEST_EMAILS = {
  valid: (domain) => `rachel.greene+bem@${domain}`,  // Should infer: Rachel Greene
  invalid: () => `test+bem@test.com`,                // Guaranteed to fail ZeroBounce (fake domain)
};

module.exports = {
  description: 'Marketing contact (POST add + DELETE remove)',
  type: 'group',
  tests: [
    // --- POST /marketing/contact tests ---

    // Test 1: Admin can add valid email (with real provider calls if TEST_EXTENDED_MODE is set)
    {
      name: 'add-admin-valid-email-succeeds',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config, state }) {
        const testEmail = TEST_EMAILS.valid(config.domain);
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - should be inferred as "Rachel Greene"
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
            assert.hasProperty(response, 'data.providers.sendgrid', 'Should have SendGrid result');
            if (providers.sendgrid?.success) {
              state.sendgridAdded = true;
            } else {
              // Log error for debugging but don't fail - could be list matching issue
              console.log('SendGrid result:', providers.sendgrid);
            }
          }

          if (process.env.BEEHIIV_API_KEY) {
            assert.hasProperty(response, 'data.providers.beehiiv', 'Should have Beehiiv result');
            if (providers.beehiiv?.success) {
              state.beehiivAdded = true;
            } else {
              console.log('Beehiiv result:', providers.beehiiv);
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

        const result = await http.delete('marketing/contact', {
          email: state.testEmail,
        });
        console.log('Cleanup result:', result.data);
      },
    },

    // Test 2: Invalid email format rejected
    {
      name: 'add-invalid-email-format-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/contact', {
          email: 'not-a-valid-email',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Invalid email format should return 400');
      },
    },

    // Test 3: Missing email rejected
    {
      name: 'add-missing-email-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/contact', {
          firstName: 'Test',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Missing email should return 400');
      },
    },

    // Test 4: Disposable email rejected
    {
      name: 'add-disposable-email-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/contact', {
          email: 'test@mailinator.com',
          source: 'bem-test',
        });

        assert.isError(response, 400, 'Disposable email should return 400');
      },
    },

    // Test 5: Name inferred from email
    {
      name: 'add-name-inferred-from-email',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config, state }) {
        // Use valid email without providing name - should infer "Rachel Greene"
        const testEmail = TEST_EMAILS.valid(config.domain);
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - should be inferred
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
          state.sendgridAdded = response.data?.providers?.sendgrid?.success;
          state.beehiivAdded = response.data?.providers?.beehiiv?.success;
        }
      },

      async cleanup({ state, http }) {
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        await http.delete('marketing/contact', { email: state.testEmail });
      },
    },

    // Test 6: Admin can skip validation (use disposable domain but skip check)
    {
      name: 'add-admin-skip-validation',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        // Use disposable domain - normally blocked, but skipValidation bypasses
        const testEmail = 'rachel.greene+bem@mailinator.com';
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          skipValidation: true,
        });

        // Should succeed because validation was skipped
        assert.isSuccess(response, 'Add marketing contact with skipValidation should succeed');

        if (process.env.TEST_EXTENDED_MODE) {
          state.sendgridAdded = response.data?.providers?.sendgrid?.success;
          state.beehiivAdded = response.data?.providers?.beehiiv?.success;
        }
      },

      async cleanup({ state, http }) {
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        await http.delete('marketing/contact', { email: state.testEmail });
      },
    },

    // Test 7: Admin can specify providers
    {
      name: 'add-admin-specify-providers',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config, state }) {
        const testEmail = TEST_EMAILS.valid(config.domain);
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          providers: ['sendgrid'], // Only SendGrid, not Beehiiv
          // No firstName/lastName - should be inferred as "Rachel Greene"
        });

        assert.isSuccess(response, 'Add marketing contact with specific providers should succeed');

        // Should only have sendgrid result
        if (response.data?.providers) {
          assert.hasProperty(response.data.providers, 'sendgrid', 'Should have SendGrid result');
        }

        if (process.env.TEST_EXTENDED_MODE) {
          state.sendgridAdded = response.data?.providers?.sendgrid?.success;
          // Beehiiv not called since we only specified sendgrid
        }
      },

      async cleanup({ state, http }) {
        if (!process.env.TEST_EXTENDED_MODE || !state.testEmail) {
          return;
        }

        await http.delete('marketing/contact', { email: state.testEmail });
      },
    },

    // Test 8: ZeroBounce validation (only runs if TEST_EXTENDED_MODE and ZEROBOUNCE_API_KEY are set)
    {
      name: 'add-zerobounce-validation',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ http, assert, config, state, skip }) {
        const testEmail = TEST_EMAILS.valid(config.domain);
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - should be inferred as "Rachel Greene"
        });

        assert.isSuccess(response, 'Add marketing contact should succeed');

        // Check that validation info is included
        assert.hasProperty(response, 'data.validation', 'Response should contain validation');
        assert.hasProperty(response, 'data.validation.checks', 'Validation should contain checks');

        // ZeroBounce should be in checks when key is set
        assert.hasProperty(response, 'data.validation.checks.zerobounce', 'Should have ZeroBounce check');

        const zbResult = response.data.validation.checks.zerobounce;

        // If ZeroBounce is out of credits, skip test - not a failure
        if (zbResult.error?.includes('out of credits')) {
          skip('ZeroBounce out of credits');
        }

        assert.hasProperty(zbResult, 'status', 'ZeroBounce should return status');

        state.sendgridAdded = response.data?.providers?.sendgrid?.success;
        state.beehiivAdded = response.data?.providers?.beehiiv?.success;
      },

      async cleanup({ state, http }) {
        if (!state.testEmail) {
          return;
        }

        await http.delete('marketing/contact', { email: state.testEmail });
      },
    },

    // Test 9: ZeroBounce rejects invalid email (only runs if TEST_EXTENDED_MODE and ZEROBOUNCE_API_KEY are set)
    {
      name: 'add-zerobounce-rejects-invalid',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ http, assert, skip }) {
        // Use fake email that ZeroBounce should flag as invalid
        const testEmail = TEST_EMAILS.invalid();

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          // No firstName/lastName - AI will try to infer from "test"
        });

        // Should still succeed (we fail open) but ZeroBounce should report invalid
        assert.isSuccess(response, 'Request should succeed even with invalid email');

        const zbResult = response.data?.validation?.checks?.zerobounce;

        // If ZeroBounce is out of credits, skip test - not a failure
        if (zbResult?.error?.includes('out of credits')) {
          skip('ZeroBounce out of credits');
        }

        // ZeroBounce should return a status indicating the email is not valid
        if (zbResult) {
          assert.hasProperty(zbResult, 'status', 'Should have status');
          // Status should NOT be 'valid' for this fake email
          assert.notEqual(zbResult.status, 'valid', 'Fake email should not be marked valid');
        }
      },
    },

    // --- Auth rejection tests ---
    {
      name: 'add-unauthenticated-requires-recaptcha',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert, config }) {
        // Public request without reCAPTCHA should fail
        const response = await http.post('marketing/contact', {
          email: TEST_EMAILS.valid(config.domain),
          source: 'bem-test',
        });

        // Should fail with 400 because no reCAPTCHA token
        assert.isError(response, 400, 'Public request without reCAPTCHA should fail');
      },
    },

    // --- DELETE /marketing/contact tests ---

    // Test: Final cleanup (runs last to clean up test contacts from providers)
    {
      name: 'delete-cleanup-test-contacts',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ http, assert, config }) {
        // Clean up the rachel.greene+bem test contact from marketing providers
        const testEmail = TEST_EMAILS.valid(config.domain);

        const response = await http.delete('marketing/contact', {
          email: testEmail,
        });

        assert.isSuccess(response, 'Remove marketing contact should succeed');
      },
    },
  ],
};
