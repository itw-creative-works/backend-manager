/**
 * Test: POST /admin/infer-contact
 * Tests the admin infer-contact endpoint for inferring names from email addresses
 *
 * AI inference tests only run when TEST_EXTENDED_MODE is set (requires BACKEND_MANAGER_OPENAI_API_KEY)
 */
module.exports = {
  description: 'Admin infer contact',
  type: 'group',
  tests: [
    // ─── Auth rejection ───

    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'john.smith@gmail.com',
        });

        assert.isError(response, 401, 'Should reject unauthenticated requests');
      },
    },

    {
      name: 'non-admin-rejected',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'john.smith@gmail.com',
        });

        assert.isError(response, 403, 'Should reject non-admin users');
      },
    },

    // ─── Single email ───

    {
      name: 'single-email-returns-result',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'john.smith@gmail.com',
        });

        assert.isSuccess(response, 'Should succeed for admin');
        assert.hasProperty(response, 'data.results', 'Should have results array');
        assert.equal(response.data.results.length, 1, 'Should have 1 result');

        const result = response.data.results[0];
        assert.equal(result.email, 'john.smith@gmail.com', 'Should include email');
        assert.ok(result.firstName, 'Should infer a first name');
        assert.ok(result.lastName, 'Should infer a last name');
        assert.hasProperty(result, 'method', 'Should include method');
        assert.hasProperty(result, 'confidence', 'Should include confidence');
      },
    },

    // ─── Batch emails ───

    {
      name: 'batch-emails-returns-all-results',
      auth: 'admin',
      timeout: 60000,

      async run({ http, assert }) {
        const emails = [
          'sarah.connor@skynet.io',
          'bob-jones@hotmail.com',
          'admin@acme.com',
        ];

        const response = await http.post('admin/infer-contact', { emails });

        assert.isSuccess(response, 'Should succeed for batch');
        assert.equal(response.data.results.length, 3, 'Should have 3 results');

        // Verify each email is in results
        for (let i = 0; i < emails.length; i++) {
          assert.equal(response.data.results[i].email, emails[i], `Result ${i} should match input email`);
        }
      },
    },

    // ─── Name parsing (regex) ───

    {
      name: 'regex-parses-dot-separated-names',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'alice.wonderland@example.com',
        });

        assert.isSuccess(response);
        const result = response.data.results[0];

        // AI or regex — either way should get the name right
        assert.equal(result.firstName, 'Alice', 'Should parse first name');
        assert.equal(result.lastName, 'Wonderland', 'Should parse last name');
      },
    },

    {
      name: 'infers-company-from-custom-domain',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'ceo@my-startup.com',
        });

        assert.isSuccess(response);
        const result = response.data.results[0];
        assert.ok(result.company, 'Should infer company from custom domain');
      },
    },

    {
      name: 'no-company-from-generic-domain',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          email: 'someone@gmail.com',
        });

        assert.isSuccess(response);
        const result = response.data.results[0];
        assert.equal(result.company, '', 'Should not infer company from gmail');
      },
    },

    // ─── AI inference (requires TEST_EXTENDED_MODE) ───

    {
      name: 'ai-inference',
      auth: 'admin',
      timeout: 60000,
      skip: !process.env.TEST_EXTENDED_MODE
        ? 'TEST_EXTENDED_MODE not set (skipping AI inference test)'
        : false,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          emails: [
            'john.smith@microsoft.com',
            'xkcd42@gmail.com',
            'bobs.burgers@example.com',
          ],
        });

        assert.isSuccess(response, 'AI inference should succeed');

        const results = response.data.results;
        const aiResults = results.filter(r => r.method === 'ai');

        assert.ok(aiResults.length > 0, 'At least one result should use AI method');

        // john.smith should be parsed correctly regardless of method
        const john = results.find(r => r.email === 'john.smith@microsoft.com');
        assert.equal(john.firstName, 'John', 'Should infer John');
        assert.equal(john.lastName, 'Smith', 'Should infer Smith');
      },
    },

    // ─── Edge cases ───

    {
      name: 'empty-emails-array-returns-empty',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/infer-contact', {
          emails: [],
        });

        assert.isSuccess(response);
        assert.equal(response.data.results.length, 0, 'Empty input should return empty results');
      },
    },
  ],
};
