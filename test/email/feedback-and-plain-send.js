/**
 * Test: Send feedback + plain template emails
 * Quick visual test — sends one of each to verify rendering.
 */
module.exports = {
  description: 'Feedback + plain template send',
  type: 'group',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,
  tests: [
    {
      name: 'feedback-template',
      auth: 'admin',
      timeout: 30000,
      async run({ http, assert, config }) {
        const response = await http.post('backend-manager/admin/email', {
          subject: '[TEST] Feedback template',
          to: `_test-email-send@${config.domain}`,
          template: 'feedback',
          sender: 'hello',
          copy: false,
          data: { signoff: { type: 'personal' } },
        });

        assert.isSuccess(response, 'Should send feedback email');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },
    {
      name: 'plain-template-with-markdown',
      auth: 'admin',
      timeout: 30000,
      async run({ http, assert, config }) {
        const response = await http.post('backend-manager/admin/email', {
          subject: '[TEST] Plain template with markdown',
          to: `_test-email-send@${config.domain}`,
          template: 'plain',
          sender: 'hello',
          copy: false,
          data: {
            content: {
              message: '# Quick Update\n\nHey Ian,\n\nJust wanted to let you know that your **account settings** have been updated successfully.\n\nHere is what changed:\n\n- Email notifications: **enabled**\n- Two-factor auth: **enabled**\n- API key: [regenerated](https://example.com/account)\n\nIf you didn\'t make these changes, please [contact support](https://example.com/support) immediately.\n\nThanks!',
            },
            signoff: { type: 'personal' },
          },
        });

        assert.isSuccess(response, 'Should send plain email');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },
  ],
};
