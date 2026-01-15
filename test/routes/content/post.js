/**
 * Test: GET /content/post
 * Tests the content fetch post endpoint
 * Fetches blog post content from GitHub
 * Requires GitHub API key and repo_website config
 */
module.exports = {
  description: 'General fetch post from GitHub',
  type: 'group',
  tests: [
    // Test 1: Missing URL returns 400 error
    {
      name: 'missing-url-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('content/post', {});

        assert.isError(response, 400, 'Missing URL should return 400');
      },
    },

    // Test 2: Non-existent post returns 404
    {
      name: 'nonexistent-post-returns-404',
      auth: 'none',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.get('content/post', {
          url: 'https://example.com/blog/this-post-definitely-does-not-exist-12345',
        });

        assert.isError(response, 404, 'Non-existent post should return 404');
      },
    },

    // Test 3: Authenticated user fetching non-existent post returns 404
    {
      name: 'authenticated-nonexistent-returns-404',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.get('content/post', {
          url: 'https://example.com/blog/nonexistent-test-post-12345',
        });

        assert.isError(response, 404, 'Non-existent post should return 404');
      },
    },
  ],
};
