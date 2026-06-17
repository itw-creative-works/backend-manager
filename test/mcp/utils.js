/**
 * Test: MCP utility functions
 * Tests resolveAuthInfo, filterToolsByRole, loadConsumerTools, buildToolMap
 *
 * Run: npx mgr test bem:mcp/utils
 */
const path = require('path');

module.exports = {
  description: 'MCP utility functions',
  type: 'group',

  tests: [
    // --- resolveAuthInfo ---

    {
      name: 'resolveAuthInfo: admin key returns admin role',
      async run({ assert }) {
        const { resolveAuthInfo } = require('../../src/mcp/utils.js');
        const saved = process.env.BACKEND_MANAGER_KEY;

        try {
          process.env.BACKEND_MANAGER_KEY = 'test-admin-key';
          const result = resolveAuthInfo('test-admin-key');

          assert.equal(result.role, 'admin', 'Should be admin');
          assert.equal(result.authType, 'adminKey', 'Should be adminKey type');
          assert.equal(result.token, 'test-admin-key', 'Token should match');
        } finally {
          process.env.BACKEND_MANAGER_KEY = saved;
        }
      },
    },

    {
      name: 'resolveAuthInfo: non-admin token returns user role',
      async run({ assert }) {
        const { resolveAuthInfo } = require('../../src/mcp/utils.js');
        const result = resolveAuthInfo('some-user-api-key');

        assert.equal(result.role, 'user', 'Should be user');
        assert.equal(result.authType, 'userToken', 'Should be userToken type');
      },
    },

    {
      name: 'resolveAuthInfo: empty token returns public role',
      async run({ assert }) {
        const { resolveAuthInfo } = require('../../src/mcp/utils.js');
        const result = resolveAuthInfo('');

        assert.equal(result.role, 'public', 'Should be public');
        assert.equal(result.authType, 'none', 'Should be none type');
        assert.equal(result.token, '', 'Token should be empty');
      },
    },

    {
      name: 'resolveAuthInfo: null/undefined token returns public role',
      async run({ assert }) {
        const { resolveAuthInfo } = require('../../src/mcp/utils.js');

        assert.equal(resolveAuthInfo(null).role, 'public', 'null should be public');
        assert.equal(resolveAuthInfo(undefined).role, 'public', 'undefined should be public');
      },
    },

    {
      name: 'resolveAuthInfo: returns public when BACKEND_MANAGER_KEY is not set',
      async run({ assert }) {
        const { resolveAuthInfo } = require('../../src/mcp/utils.js');
        const saved = process.env.BACKEND_MANAGER_KEY;

        try {
          delete process.env.BACKEND_MANAGER_KEY;
          const result = resolveAuthInfo('any-token');

          assert.equal(result.role, 'user', 'Non-empty token with no config key should be user');
        } finally {
          process.env.BACKEND_MANAGER_KEY = saved;
        }
      },
    },

    // --- filterToolsByRole ---

    {
      name: 'filterToolsByRole: admin sees all roles',
      async run({ assert }) {
        const { filterToolsByRole } = require('../../src/mcp/utils.js');
        const tools = [
          { name: 'a', role: 'admin' },
          { name: 'b', role: 'user' },
          { name: 'c', role: 'public' },
        ];
        const result = filterToolsByRole(tools, 'admin');

        assert.equal(result.length, 3, 'Admin should see all 3');
      },
    },

    {
      name: 'filterToolsByRole: user sees user + public only',
      async run({ assert }) {
        const { filterToolsByRole } = require('../../src/mcp/utils.js');
        const tools = [
          { name: 'a', role: 'admin' },
          { name: 'b', role: 'user' },
          { name: 'c', role: 'public' },
        ];
        const result = filterToolsByRole(tools, 'user');

        assert.equal(result.length, 2, 'User should see 2');
        assert.ok(result.some((t) => t.name === 'b'), 'Should include user tool');
        assert.ok(result.some((t) => t.name === 'c'), 'Should include public tool');
        assert.ok(!result.some((t) => t.name === 'a'), 'Should exclude admin tool');
      },
    },

    {
      name: 'filterToolsByRole: public sees public only',
      async run({ assert }) {
        const { filterToolsByRole } = require('../../src/mcp/utils.js');
        const tools = [
          { name: 'a', role: 'admin' },
          { name: 'b', role: 'user' },
          { name: 'c', role: 'public' },
        ];
        const result = filterToolsByRole(tools, 'public');

        assert.equal(result.length, 1, 'Public should see 1');
        assert.equal(result[0].name, 'c', 'Should be the public tool');
      },
    },

    {
      name: 'filterToolsByRole: tools without role default to admin',
      async run({ assert }) {
        const { filterToolsByRole } = require('../../src/mcp/utils.js');
        const tools = [{ name: 'no-role' }];

        assert.equal(filterToolsByRole(tools, 'admin').length, 1, 'Admin should see role-less tool');
        assert.equal(filterToolsByRole(tools, 'user').length, 0, 'User should not see role-less tool');
        assert.equal(filterToolsByRole(tools, 'public').length, 0, 'Public should not see role-less tool');
      },
    },

    {
      name: 'filterToolsByRole: unknown role treated as public',
      async run({ assert }) {
        const { filterToolsByRole } = require('../../src/mcp/utils.js');
        const tools = [
          { name: 'a', role: 'admin' },
          { name: 'b', role: 'user' },
          { name: 'c', role: 'public' },
        ];
        const result = filterToolsByRole(tools, 'garbage');

        assert.equal(result.length, 1, 'Unknown role should see public only');
      },
    },

    // --- loadConsumerTools ---

    {
      name: 'loadConsumerTools: returns empty array when no cwd',
      async run({ assert }) {
        const { loadConsumerTools } = require('../../src/mcp/utils.js');

        assert.equal(loadConsumerTools(null).length, 0, 'null cwd');
        assert.equal(loadConsumerTools('').length, 0, 'empty cwd');
        assert.equal(loadConsumerTools(undefined).length, 0, 'undefined cwd');
      },
    },

    {
      name: 'loadConsumerTools: returns empty array for non-existent directory',
      async run({ assert }) {
        const { loadConsumerTools } = require('../../src/mcp/utils.js');
        const result = loadConsumerTools('/tmp/does-not-exist-12345');

        assert.equal(result.length, 0, 'Should return empty array');
      },
    },

    // --- buildToolMap ---

    {
      name: 'buildToolMap: consumer tools override built-ins with same name',
      async run({ assert }) {
        const { buildToolMap } = require('../../src/mcp/utils.js');
        const builtin = [{ name: 'tool_a', description: 'original' }];
        const consumer = [{ name: 'tool_a', description: 'override', _consumer: true }];

        const map = buildToolMap(builtin, consumer);
        assert.equal(map.get('tool_a').description, 'override', 'Consumer should override');
        assert.equal(map.get('tool_a')._consumer, true, 'Should be marked as consumer');
      },
    },

    {
      name: 'buildToolMap: merges non-overlapping tools',
      async run({ assert }) {
        const { buildToolMap } = require('../../src/mcp/utils.js');
        const builtin = [{ name: 'a' }, { name: 'b' }];
        const consumer = [{ name: 'c' }];

        const map = buildToolMap(builtin, consumer);
        assert.equal(map.size, 3, 'Should have 3 tools total');
        assert.ok(map.has('a'), 'Should have a');
        assert.ok(map.has('b'), 'Should have b');
        assert.ok(map.has('c'), 'Should have c');
      },
    },

    // --- Real tools verification ---

    {
      name: 'all 19 built-in tools have a role assigned',
      async run({ assert }) {
        const tools = require('../../src/mcp/tools.js');

        assert.equal(tools.length, 25, 'Should have 25 tools');

        const missing = tools.filter((t) => !t.role);
        assert.equal(missing.length, 0, `All tools should have roles, missing: ${missing.map((t) => t.name).join(', ')}`);
      },
    },

    {
      name: 'role distribution matches expected counts',
      async run({ assert }) {
        const tools = require('../../src/mcp/tools.js');

        const admin = tools.filter((t) => t.role === 'admin');
        const user = tools.filter((t) => t.role === 'user');
        const pub = tools.filter((t) => t.role === 'public');

        assert.equal(admin.length, 22, `Should have 22 admin tools, got ${admin.length}`);
        assert.equal(user.length, 2, `Should have 2 user tools, got ${user.length}`);
        assert.equal(pub.length, 1, `Should have 1 public tool, got ${pub.length}`);
      },
    },
  ],
};
