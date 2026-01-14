/**
 * Test: admin:write-repo-content
 * Tests the admin write repo content command
 * Writes arbitrary content to a GitHub repository
 * Requires admin/blogger role, GitHub API key, and repo_website config
 *
 * IMPORTANT: These tests require GITHUB_TOKEN and github.repo_website to be configured.
 * If GitHub is not configured, the tests will fail.
 *
 * This is a suite because we need to clean up created files and cancel workflows after tests.
 */
const { Octokit } = require('@octokit/rest');

// Test file paths that will be created and need cleanup
const TEST_FILES = [
  '_test/bem-write-test.txt',
  '_test/type-test.txt',
];

module.exports = {
  description: 'Admin write content to GitHub repo',
  type: 'suite',
  timeout: 120000,
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set (skipping GitHub write tests)' : false,

  tests: [
    // Test 1: Missing path returns 400 error
    {
      name: 'missing-path-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:write-repo-content', {
          content: 'Test content',
        });

        assert.isError(response, 400, 'Missing path should return 400');
      },
    },

    // Test 4: Missing content returns 400 error
    {
      name: 'missing-content-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:write-repo-content', {
          path: '_test/bem-test-file.txt',
        });

        assert.isError(response, 400, 'Missing content should return 400');
      },
    },

    // Test 5: Admin can write content
    {
      name: 'admin-can-write-content',
      auth: 'admin',
      timeout: 60000,

      async run({ http, assert, state }) {
        const uniqueContent = `BEM Test - ${new Date().toISOString()}`;
        const response = await http.command('admin:write-repo-content', {
          path: '_test/bem-write-test.txt',
          content: uniqueContent,
        });

        assert.isSuccess(response, 'Admin should be able to write content');
        assert.hasProperty(response, 'data.path', 'Response should contain path');
        assert.equal(response.data.path, '_test/bem-write-test.txt', 'Path should match');

        // Store for cleanup
        state.filesCreated = state.filesCreated || [];
        state.filesCreated.push('_test/bem-write-test.txt');
      },
    },

    // Test 6: Content type defaults to text
    {
      name: 'content-type-default',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, state }) {
        const response = await http.command('admin:write-repo-content', {
          path: '_test/type-test.txt',
          content: 'Test content with default type',
        });

        assert.isSuccess(response, 'Write with default type should succeed');
        assert.hasProperty(response, 'data.type', 'Response should contain type');
        assert.equal(response.data.type, 'text', 'Default type should be text');

        // Store for cleanup
        state.filesCreated = state.filesCreated || [];
        state.filesCreated.push('_test/type-test.txt');
      },
    },

    // Test 7: Non-existent repo returns 404
    {
      name: 'nonexistent-repo-returns-404',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:write-repo-content', {
          path: '_test/custom-repo-test.txt',
          content: 'Test content',
          githubUser: 'nonexistent-user-12345',
          githubRepo: 'nonexistent-repo-12345',
        });

        assert.isError(response, 404, 'Non-existent repo should return 404');
      },
    },

    // --- Auth rejection tests (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:write-repo-content', {
          path: '_test/bem-test-file.txt',
          content: 'Test content',
        });

        assert.isError(response, 401, 'Write repo content should fail without authentication');
      },
    },

    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:write-repo-content', {
          path: '_test/bem-test-file.txt',
          content: 'Test content',
        });

        assert.isError(response, 401, 'Write repo content should fail for non-admin user');
      },
    },

    // Cleanup - delete test files and cancel workflows
    {
      name: 'cleanup',
      auth: 'admin',
      timeout: 60000,

      async run({ state, config }) {
        if (!process.env.GITHUB_TOKEN || !config.githubRepoWebsite) {
          return;
        }

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Parse owner/repo from githubRepoWebsite (e.g., 'https://github.com/owner/repo')
        const repoMatch = config.githubRepoWebsite.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!repoMatch) {
          return;
        }
        const owner = repoMatch[1];
        const repo = repoMatch[2];

        // Delete test files
        const filesToDelete = state.filesCreated || TEST_FILES;
        for (const filePath of filesToDelete) {
          try {
            const { data: fileData } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filePath,
            });

            await octokit.rest.repos.deleteFile({
              owner,
              repo,
              path: filePath,
              message: `🧹 BEM test cleanup: ${filePath}`,
              sha: fileData.sha,
            });
          } catch (e) {
            // File might not exist, ignore
          }
        }

        // Cancel running workflows triggered by our test commits
        try {
          const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
            owner,
            repo,
            status: 'in_progress',
            per_page: 10,
          });

          for (const run of runs.workflow_runs) {
            if (run.head_commit?.message?.includes('admin:write-repo-content')
                || run.head_commit?.message?.includes('BEM test cleanup')) {
              try {
                await octokit.rest.actions.cancelWorkflowRun({
                  owner,
                  repo,
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
