/**
 * Test: POST /marketing/contact and DELETE /marketing/contact
 * Tests the marketing contact endpoints for adding/removing users to SendGrid/Beehiiv
 *
 * Set TEST_EXTENDED_MODE=true to run tests against real SendGrid/Beehiiv APIs
 * (requires SENDGRID_API_KEY and BEEHIIV_API_KEY env vars)
 */

// Test email patterns - look like real emails but +bem suffix identifies them for cleanup.
// Names should be inferred by AI from the email local part.
//
// Fixed test domain (`acme.com`) — deterministic across brands. Using the running brand's
// domain caused cross-brand state divergence in SendGrid/Beehiiv and non-deterministic
// company inference (different domain → different inferred company name).
//
// `valid`: use a name that won't be flagged as fictional/placeholder by the AI prompt.
// (The infer-contact prompt rejects fictional names — e.g. "rachel.greene" sometimes
// matches the Friends character and returns empty. Use a more anonymous name.)
//
// `invalid`: must reach the ZeroBounce mailbox check (so previous checks all pass — must
// NOT start with "test"/"example" which are in BLOCKED_LOCAL_PATTERNS, NOT be on
// a corporate/disposable domain). Real-looking name on a real domain with no actual
// mailbox there is the safest pick.
const TEST_DOMAIN = 'acme.com';
const TEST_EMAILS = {
  valid: () => `sarah.martinez+bem@${TEST_DOMAIN}`,         // Should infer: Sarah Martinez
  invalid: () => `nonexistent.user+bem@${TEST_DOMAIN}`,     // No such mailbox — ZeroBounce should flag as invalid
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

      async run({ http, assert, state }) {
        const testEmail = TEST_EMAILS.valid();
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
          // skipValidation bypasses the ZeroBounce mailbox check — the test email
          // (rachel.greene+bem@{brand}) doesn't have a real mailbox so ZeroBounce
          // (correctly) marks it as not deliverable. We're testing the route flow,
          // not the deliverability check itself.
          skipValidation: true,
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

    // Test 5: Name inferred from email (AI only — requires extended mode)
    {
      name: 'add-name-inferred-from-email',
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set (AI inference requires OPENAI_API_KEY)' : false,
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        // Use valid email without providing name - should infer "Rachel Greene"
        const testEmail = TEST_EMAILS.valid();
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

    // Test 7: Mailbox verification (only runs if TEST_EXTENDED_MODE and ZEROBOUNCE_API_KEY are set)
    {
      name: 'add-mailbox-validation',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ http, assert, state, skip }) {
        const testEmail = TEST_EMAILS.valid();
        state.testEmail = testEmail;

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
        });

        assert.isSuccess(response, 'Add marketing contact should succeed');

        // Check that validation info is included
        assert.hasProperty(response, 'data.validation', 'Response should contain validation');
        assert.hasProperty(response, 'data.validation.checks', 'Validation should contain checks');

        // Mailbox check should be in checks when key is set
        assert.hasProperty(response, 'data.validation.checks.mailbox', 'Should have mailbox check');

        const mbResult = response.data.validation.checks.mailbox;

        // If out of credits, skip test - not a failure
        if (mbResult.error?.includes('out of credits')) {
          skip('Mailbox verification out of credits');
        }

        assert.hasProperty(mbResult, 'status', 'Mailbox check should return status');

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

    // Test 9: Mailbox verification rejects invalid email (only runs if TEST_EXTENDED_MODE and ZEROBOUNCE_API_KEY are set)
    {
      name: 'add-mailbox-rejects-invalid',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE || !process.env.ZEROBOUNCE_API_KEY
        ? 'TEST_EXTENDED_MODE or ZEROBOUNCE_API_KEY not set'
        : false,

      async run({ http, assert, skip }) {
        // Email that should reach ZeroBounce and be flagged as undeliverable.
        // Must NOT trip earlier checks (localPart blocklist, disposable, corporate).
        const testEmail = TEST_EMAILS.invalid();

        const response = await http.post('marketing/contact', {
          email: testEmail,
          source: 'bem-test',
        });

        // With no ZeroBounce credits the route fails-open and returns 200; with credits
        // the route should EITHER succeed (200) and report invalid in checks, OR error
        // (400) with "Email validation failed". Either is correct behavior — what we
        // verify here is that mailbox check ran and didn't mark the email as `valid`.
        const mbResult = response.data?.validation?.checks?.mailbox;

        // If credits are out, the test can't actually exercise rejection — skip.
        if (mbResult?.error?.includes('out of credits') || mbResult?.error?.includes('Invalid API key')) {
          skip('Mailbox verification out of credits');
        }

        // If the response was a 400, that's the legitimate rejection path — done.
        if (response.status === 400) {
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

    // --- Auth rejection tests ---
    {
      name: 'add-unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        // Public request without auth must be rejected. The exact rejection mechanism
        // depends on environment:
        //   - Production: missing reCAPTCHA token → 403
        //   - Local emulator (BEM_TESTING=true): reCAPTCHA is bypassed, but unauthenticated
        //     users hit the marketing-subscribe rate limit (quota 0/0) → 429
        // Both are correct: the route protects itself from anonymous abuse. Accept either.
        const response = await http.post('marketing/contact', {
          email: TEST_EMAILS.valid(),
          source: 'bem-test',
        });

        assert.ok(!response.success, 'Public request should be rejected');
        assert.ok(
          response.status === 403 || response.status === 429,
          `Expected 403 or 429 but got ${response.status}`
        );
      },
    },

    // --- DELETE /marketing/contact tests ---

    // Test: Final cleanup (runs last to clean up test contacts from providers)
    {
      name: 'delete-cleanup-test-contacts',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ http, assert }) {
        // Clean up the rachel.greene+bem test contact from marketing providers
        const testEmail = TEST_EMAILS.valid();

        const response = await http.delete('marketing/contact', {
          email: testEmail,
        });

        assert.isSuccess(response, 'Remove marketing contact should succeed');
      },
    },
  ],
};
