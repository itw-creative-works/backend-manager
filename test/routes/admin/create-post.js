/**
 * Test: POST /admin/post
 * Tests the admin create post endpoint
 * Creates blog posts via GitHub with image extraction and @post/ body rewriting
 * Requires admin/blogger role, GitHub API key, and repo_website config
 */
const { Octokit } = require('@octokit/rest');

module.exports = {
  description: 'Admin create post on GitHub',
  type: 'suite',
  timeout: 300000, // 5 minutes total for the suite

  tests: [
    // --- Validation tests (no GitHub needed) ---

    {
      name: 'missing-title-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          url: 'test-post',
          description: 'Test description',
          headerImageURL: 'https://example.com/image.jpg',
          body: 'Test content',
        });

        assert.isError(response, 400, 'Missing title should return 400');
      },
    },

    {
      name: 'missing-url-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          description: 'Test description',
          headerImageURL: 'https://example.com/image.jpg',
          body: 'Test content',
        });

        assert.isError(response, 400, 'Missing URL should return 400');
      },
    },

    {
      name: 'missing-description-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          url: 'test-post',
          headerImageURL: 'https://example.com/image.jpg',
          body: 'Test content',
        });

        assert.isError(response, 400, 'Missing description should return 400');
      },
    },

    {
      name: 'missing-header-image-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          url: 'test-post',
          description: 'Test description',
          body: 'Test content',
        });

        assert.isError(response, 400, 'Missing headerImageURL should return 400');
      },
    },

    {
      name: 'missing-body-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          url: 'test-post',
          description: 'Test description',
          headerImageURL: 'https://example.com/image.jpg',
        });

        assert.isError(response, 400, 'Missing body should return 400');
      },
    },

    // --- Integration: create post with inline image, verify @post/ rewriting ---

    {
      name: 'create-post-rewrites-body-images',
      auth: 'admin',
      timeout: 120000,
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set' : false,

      async run({ http, assert, state, config }) {
        if (!process.env.GITHUB_TOKEN) {
          assert.fail('GITHUB_TOKEN env var not set');
          return;
        }

        if (!config.githubRepoWebsite) {
          assert.fail('githubRepoWebsite not configured');
          return;
        }

        // Parse owner/repo for cleanup later
        const repoMatch = config.githubRepoWebsite.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!repoMatch) {
          assert.fail('Could not parse githubRepoWebsite');
          return;
        }

        state.owner = repoMatch[1];
        state.repo = repoMatch[2];

        // Use a real public .jpg for the inline image
        const inlineImageURL = 'https://picsum.photos/id/10/200/200.jpg';

        const response = await http.post('admin/post', {
          title: 'BEM Test Create Post',
          url: 'bem-test-create-post',
          description: 'Test post created by BEM test suite to verify @post/ body rewriting.',
          headerImageURL: 'https://picsum.photos/id/1/400/300.jpg',
          body: `# BEM Test Create Post\n\nSome intro text.\n\n![Test inline image](${inlineImageURL})\n\nMore text after the image.`,
          postPath: 'guest',
        });

        assert.isSuccess(response, 'Create post should succeed');
        assert.hasProperty(response, 'data.id', 'Response should have post id');
        assert.hasProperty(response, 'data.path', 'Response should have post path');

        // Store for cleanup
        state.postId = response.data.id;
        state.postPath = `${response.data.path}/${response.data.date}-bem-test-create-post.md`;
      },
    },

    {
      name: 'verify-body-has-at-post-prefix',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set' : false,

      async run({ assert, state }) {
        if (!state.postPath) {
          return; // Previous test didn't run
        }

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Fetch the committed post from GitHub
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner: state.owner,
          repo: state.repo,
          path: state.postPath,
        });

        const content = Buffer.from(fileData.content, 'base64').toString();
        state.currentSha = fileData.sha;

        // The body should contain @post/ prefix instead of the original external URL
        assert.ok(
          content.includes('@post/'),
          'Post body should contain @post/ prefix for downloaded images',
        );

        assert.ok(
          !content.includes('picsum.photos/id/10'),
          'Post body should NOT contain the original external inline image URL',
        );
      },
    },

    // --- Auth rejection tests ---

    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          url: 'test-post',
          description: 'Test description',
          headerImageURL: 'https://example.com/image.jpg',
          body: 'Test content',
        });

        assert.isError(response, 401, 'Create post should fail without authentication');
      },
    },

    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/post', {
          title: 'Test Post',
          url: 'test-post',
          description: 'Test description',
          headerImageURL: 'https://example.com/image.jpg',
          body: 'Test content',
        });

        assert.isError(response, 403, 'Create post should fail for non-admin user');
      },
    },

    // --- Cleanup ---

    {
      name: 'cleanup',
      auth: 'admin',
      timeout: 60000,

      async run({ state }) {
        if (!process.env.GITHUB_TOKEN || !state.postPath) {
          return;
        }

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Delete the test post
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner: state.owner,
            repo: state.repo,
            path: state.postPath,
          });

          await octokit.rest.repos.deleteFile({
            owner: state.owner,
            repo: state.repo,
            path: state.postPath,
            message: '🧹 BEM test cleanup: delete create-post test',
            sha: fileData.sha,
          });
        } catch (e) {
          // File might not exist, ignore
        }

        // Delete uploaded test images
        const imagePath = `src/assets/images/blog/post-${state.postId}/`;
        try {
          const { data: dirData } = await octokit.rest.repos.getContent({
            owner: state.owner,
            repo: state.repo,
            path: imagePath,
          });

          // Delete each image file
          for (const file of dirData) {
            await octokit.rest.repos.deleteFile({
              owner: state.owner,
              repo: state.repo,
              path: file.path,
              message: `🧹 BEM test cleanup: delete test image ${file.name}`,
              sha: file.sha,
            });
          }
        } catch (e) {
          // Directory might not exist, ignore
        }

        // Cancel any running workflows triggered by our test commits
        try {
          const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
            owner: state.owner,
            repo: state.repo,
            status: 'in_progress',
            per_page: 10,
          });

          for (const run of runs.workflow_runs) {
            if (run.head_commit?.message?.includes('BEM test')) {
              try {
                await octokit.rest.actions.cancelWorkflowRun({
                  owner: state.owner,
                  repo: state.repo,
                  run_id: run.id,
                });
              } catch (e) {
                // May already be completed, ignore
              }
            }
          }
        } catch (e) {
          // Workflow cancellation failed, not critical
        }
      },
    },
  ],
};
