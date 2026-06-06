/**
 * Test: Push notification send
 * Sends a test push notification to a specific FCM token.
 * Requires TEST_EXTENDED_MODE=true and TEST_FCM_TOKEN env var.
 */
module.exports = {
  description: 'Push notification send',
  auth: 'admin',
  skip: !process.env.TEST_EXTENDED_MODE
    ? 'TEST_EXTENDED_MODE not set'
    : !process.env.TEST_FCM_TOKEN
      ? 'TEST_FCM_TOKEN env var not set'
      : false,
  timeout: 30000,

  async run({ http, assert, config }) {
    const response = await http.post('marketing/campaign', {
      name: '[TEST] Push notification',
      subject: 'This is a test push notification from BEM',
      type: 'push',
      test: true,
      sendAt: 'now',
      filters: { token: process.env.TEST_FCM_TOKEN },
    });

    assert.isSuccess(response, 'Should create and send push campaign');
    assert.ok(response.data.id, 'Should have campaign ID');
    assert.equal(response.data.status, 'sent', 'Should be sent immediately');
    assert.ok(response.data.providers?.push, 'Should have push result');
    assert.equal(response.data.providers.push.sent, 1, 'Should have sent to 1 token');
  },
};
