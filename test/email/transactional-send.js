/**
 * Test: Single transactional email send
 * Verifies the full pipeline end-to-end: prepare → render → deliver via SendGrid.
 */
module.exports = {
  description: 'Transactional email send',
  auth: 'admin',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,
  timeout: 30000,

  async run({ http, assert, config }) {
    const response = await http.post('backend-manager/admin/email', {
      subject: '[TEST] Transactional pipeline — card template',
      to: `_test-email-send@${config.domain}`,
      template: 'card',
      sender: 'hello',
      copy: false,
      data: {
        content: {
          title: 'Pipeline Test',
          message: '# It works\n\nMarkdown → HTML → MJML → email.\n\n- **Bold** and *italic*\n- `Code` inline\n- A [link](https://example.com)',
        },
        signoff: { type: 'personal' },
      },
    });

    assert.isSuccess(response, 'Should send successfully');
    assert.equal(response.data.status, 'sent', 'Status should be sent');
    assert.ok(response.data.options.content?.[0]?.value?.includes('<html'), 'Should have rendered HTML');
    assert.ok(response.data.options.content[0].value.includes('It works'), 'Markdown should be rendered');
    assert.ok(response.data.options.asm, 'Should have ASM group');
    assert.ok(response.data.options.headers['List-Unsubscribe'], 'Should have unsubscribe header');
  },
};
