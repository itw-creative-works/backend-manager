/**
 * Test: POST /user/feedback
 * Tests the user submit feedback endpoint
 * Requires authentication, saves feedback to Firestore
 * Note: Makes external call to ITW getApp endpoint
 */
module.exports = {
  description: 'User submit feedback',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can submit feedback
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 30000, // Longer timeout due to external API call

      async run({ http, assert }) {
        const response = await http.post('user/feedback', {
          rating: 'like',
          like: 'Great app! Works well.',
          dislike: '',
        });

        assert.isSuccess(response, 'Submit feedback should succeed for authenticated user');
        assert.hasProperty(response, 'data.review', 'Response should contain review decision');
        assert.hasProperty(response, 'data.originalRequest', 'Response should contain original request');
      },
    },

    // Test 2: Feedback with love rating
    {
      name: 'love-rating-succeeds',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('user/feedback', {
          rating: 'love',
          like: 'Absolutely love this app! Best thing ever! Highly recommend!',
          dislike: '',
        });

        assert.isSuccess(response, 'Submit feedback with love rating should succeed');
        assert.hasProperty(response, 'data.review.promptReview', 'Response should have promptReview flag');
        assert.ok(
          typeof response.data.review.promptReview === 'boolean',
          'promptReview should be a boolean'
        );
      },
    },

    // Test 3: Feedback with dislike
    {
      name: 'dislike-feedback-succeeds',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('user/feedback', {
          rating: 'dislike',
          like: '',
          dislike: 'Could use some improvements in the UI',
        });

        assert.isSuccess(response, 'Submit negative feedback should succeed');
        assert.hasProperty(response, 'data.review', 'Response should contain review decision');
      },
    },

    // Test 4: Premium user can submit feedback
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('user/feedback', {
          rating: 'like',
          like: 'Premium features are great!',
          dislike: '',
        });

        assert.isSuccess(response, 'Submit feedback should succeed for premium user');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/feedback', {
          rating: 'like',
          like: 'Test',
          dislike: '',
        });

        assert.isError(response, 401, 'Submit feedback should fail without authentication');
      },
    },
  ],
};
