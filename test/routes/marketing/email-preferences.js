/**
 * Test: POST /marketing/email-preferences
 * Tests the email preferences endpoint for unsubscribe/resubscribe via SendGrid ASM
 *
 * Set TEST_EXTENDED_MODE=true to run tests against real SendGrid ASM API
 * (requires SENDGRID_API_KEY env var)
 */
const crypto = require('crypto');

const TEST_EMAIL = 'rachel.greene+bem-unsub@gmail.com';
const TEST_ASM_ID = '24077';

function generateSig(email) {
  return crypto.createHmac('sha256', process.env.UNSUBSCRIBE_HMAC_KEY).update(email.toLowerCase()).digest('hex');
}

module.exports = {
  description: 'Marketing email-preferences (POST unsubscribe/resubscribe)',
  type: 'group',
  tests: [
    // Test 1: Successful unsubscribe with valid sig
    {
      name: 'unsubscribe-valid-sig-succeeds',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: sig,
        });

        assert.isSuccess(response, 'Unsubscribe with valid sig should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
      },
    },

    // Test 2: Successful resubscribe with valid sig
    {
      name: 'resubscribe-valid-sig-succeeds',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'resubscribe',
          sig: sig,
        });

        assert.isSuccess(response, 'Resubscribe with valid sig should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
      },
    },

    // Test 3: Invalid sig rejected
    {
      name: 'invalid-sig-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: 'invalid-signature-value',
        });

        assert.isError(response, 403, 'Invalid sig should return 403');
      },
    },

    // Test 4: Missing sig rejected (schema requires it)
    {
      name: 'missing-sig-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
        });

        assert.isError(response, 400, 'Missing sig should return 400');
      },
    },

    // Test 5: Missing email rejected
    {
      name: 'missing-email-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/email-preferences', {
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: 'anything',
        });

        assert.isError(response, 400, 'Missing email should return 400');
      },
    },

    // Test 6: Invalid email format rejected
    {
      name: 'invalid-email-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig('not-an-email');

        const response = await http.post('marketing/email-preferences', {
          email: 'not-an-email',
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: sig,
        });

        assert.isError(response, 400, 'Invalid email format should return 400');
      },
    },

    // Test 7: Missing asmId rejected
    {
      name: 'missing-asmid-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          action: 'unsubscribe',
          sig: sig,
        });

        assert.isError(response, 400, 'Missing asmId should return 400');
      },
    },

    // Test 8: Invalid action rejected
    {
      name: 'invalid-action-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'delete',
          sig: sig,
        });

        assert.isError(response, 400, 'Invalid action should return 400');
      },
    },

    // Test 9: Sig for different email rejected (proves per-email sig)
    {
      name: 'wrong-email-sig-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        // Generate sig for a different email
        const sig = generateSig('someone-else@gmail.com');

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: sig,
        });

        assert.isError(response, 403, 'Sig for different email should return 403');
      },
    },

    // Test 10: Authenticated user also works (sig is checked regardless of auth)
    {
      name: 'authenticated-user-with-valid-sig-succeeds',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const sig = generateSig(TEST_EMAIL);

        const response = await http.post('marketing/email-preferences', {
          email: TEST_EMAIL,
          asmId: TEST_ASM_ID,
          action: 'unsubscribe',
          sig: sig,
        });

        assert.isSuccess(response, 'Authenticated user with valid sig should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');
      },
    },
  ],
};
