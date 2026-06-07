/**
 * Test: Single marketing campaign send
 * Verifies the full marketing pipeline end-to-end: prepare → render → audience → SendGrid Single Send.
 * Sends to test_admin segment only.
 */
module.exports = {
  description: 'Marketing campaign send',
  auth: 'admin',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,
  timeout: 60000,

  async run({ http, assert }) {
    const response = await http.post('backend-manager/marketing/campaign', {
      name: '[TEST] Summer Sale — Free Users',
      subject: 'Summer Sale — {discount.percent}% Off Your First Month!',
      preheader: 'Limited time offer — upgrade to Premium today',
      template: 'card',
      data: {
        content: {
          title: 'Summer Sale!',
          message: [
            'You\'ve been using **{brand.name}** on our free plan — and we think you\'ll love what\'s on the other side.',
            '',
            'For a limited time, upgrade to Premium and get **{discount.percent}% off** your first month.',
            '',
            'Use code **{discount.code}** at checkout.',
          ].join('\n'),
          button: { text: 'Upgrade Now →', url: '{brand.url}/pricing' },
          discountCode: 'UPGRADE15',
        },
      },
      test: true,
      sendAt: 'now',
    });

    assert.isSuccess(response, 'Should create and schedule campaign');
    assert.ok(response.data.id, 'Should have campaign ID');

    const sg = response.data?.providers?.campaigns;
    assert.ok(sg, 'Should have campaigns result');
    assert.equal(sg.success, true, 'Campaigns (SendGrid) should succeed');
    assert.ok(sg.id, 'Should have Single Send ID');
    assert.equal(sg.scheduled, true, 'Should be scheduled');
  },
};
