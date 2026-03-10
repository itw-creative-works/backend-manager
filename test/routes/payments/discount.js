/**
 * Test: GET /payments/discount
 * Tests discount code validation endpoint
 */
module.exports = {
  description: 'Discount code validation',
  type: 'group',
  timeout: 15000,

  tests: [
    {
      name: 'rejects-missing-code',
      async run({ http, assert }) {
        const response = await http.as('none').get('payments/discount');

        assert.isError(response, 400, 'Should reject missing code');
      },
    },

    {
      name: 'returns-valid-for-known-code',
      async run({ http, assert }) {
        const response = await http.as('none').get('payments/discount', {
          code: 'FLASH20',
        });

        assert.isSuccess(response, 'Should succeed for valid code');
        assert.equal(response.data.valid, true, 'Should be valid');
        assert.equal(response.data.code, 'FLASH20', 'Should return normalized code');
        assert.equal(response.data.percent, 20, 'Should return correct percent');
        assert.equal(response.data.duration, 'once', 'Should return duration');
      },
    },

    {
      name: 'returns-valid-case-insensitive',
      async run({ http, assert }) {
        const response = await http.as('none').get('payments/discount', {
          code: 'flash20',
        });

        assert.isSuccess(response, 'Should succeed for lowercase code');
        assert.equal(response.data.valid, true, 'Should be valid (case-insensitive)');
        assert.equal(response.data.code, 'FLASH20', 'Should return uppercase code');
      },
    },

    {
      name: 'returns-invalid-for-unknown-code',
      async run({ http, assert }) {
        const response = await http.as('none').get('payments/discount', {
          code: 'NOTAREALCODE',
        });

        assert.isSuccess(response, 'Should return 200 even for invalid code');
        assert.equal(response.data.valid, false, 'Should be invalid');
      },
    },

    {
      name: 'validates-all-known-codes',
      async run({ http, assert }) {
        const codes = [
          { code: 'FLASH20', percent: 20 },
          { code: 'SAVE10', percent: 10 },
          { code: 'WELCOME15', percent: 15 },
        ];

        for (const { code, percent } of codes) {
          const response = await http.as('none').get('payments/discount', { code });

          assert.isSuccess(response, `Should succeed for ${code}`);
          assert.equal(response.data.valid, true, `${code} should be valid`);
          assert.equal(response.data.percent, percent, `${code} should be ${percent}%`);
          assert.equal(response.data.duration, 'once', `${code} should be once`);
        }
      },
    },
  ],
};
