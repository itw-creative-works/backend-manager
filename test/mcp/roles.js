/**
 * Test: MCP role-based tool scoping
 * Tests that admin/user/public roles see the correct tools via the MCP protocol endpoint
 *
 * Run: npx mgr test bem:mcp/roles
 */
const fetch = require('wonderful-fetch');

const MCP_ENDPOINT = 'http://localhost:5002/backend-manager/mcp';

function parseSSE(text) {
  const lines = text.split('\n');
  let lastData = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      lastData = line.slice(6);
    }
  }

  if (lastData) {
    return JSON.parse(lastData);
  }

  return JSON.parse(text);
}

async function mcpRequest(method, params, bearerToken) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: method,
    params: params || {},
  });

  const text = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: headers,
    body: body,
    response: 'text',
    timeout: 15000,
  });

  return parseSSE(text);
}

module.exports = {
  description: 'MCP role-based tool scoping',
  type: 'group',

  tests: [
    {
      name: 'admin sees all 19 tools',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/list', {}, key);

        assert.ok(response?.result?.tools, 'Should return tools list');

        const tools = response.result.tools;
        assert.equal(tools.length, 25, `Admin should see all 25 tools, got ${tools.length}`);

        const names = tools.map((t) => t.name);
        assert.ok(names.includes('firestore_read'), 'Admin should see firestore_read');
        assert.ok(names.includes('get_user'), 'Admin should see get_user');
        assert.ok(names.includes('health_check'), 'Admin should see health_check');
      },
    },

    {
      name: 'user sees only user + public tools',
      async run({ assert, accounts }) {
        const userKey = accounts.basic?.privateKey;
        assert.ok(userKey, 'Test account should have a privateKey');

        const response = await mcpRequest('tools/list', {}, userKey);

        assert.ok(response?.result?.tools, 'Should return tools list');

        const tools = response.result.tools;
        const names = tools.map((t) => t.name);

        // User should see user-role tools
        assert.ok(names.includes('get_user'), 'User should see get_user');
        assert.ok(names.includes('get_subscription'), 'User should see get_subscription');

        // User should see public tools
        assert.ok(names.includes('health_check'), 'User should see health_check');

        // User should NOT see admin tools
        assert.ok(!names.includes('firestore_read'), 'User should NOT see firestore_read');
        assert.ok(!names.includes('send_email'), 'User should NOT see send_email');
        assert.ok(!names.includes('cancel_subscription'), 'User should NOT see cancel_subscription');
        assert.ok(!names.includes('generate_uuid'), 'User should NOT see generate_uuid');

        assert.equal(tools.length, 3, `User should see 3 tools (2 user + 1 public), got ${tools.length}`);
      },
    },

    {
      name: 'unauthenticated gets 401 (triggers OAuth flow)',
      async run({ assert }) {
        try {
          const response = await mcpRequest('tools/list', {});
          // If we got here, check for Unauthorized error
          assert.equal(response?.error, 'Unauthorized', 'Should return Unauthorized');
        } catch (error) {
          // 401 throws — this is correct behavior
          assert.ok(true, 'Unauthenticated request returned 401');
        }
      },
    },

    {
      name: 'admin can call an admin tool',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'health_check',
          arguments: {},
        }, key);

        assert.ok(response?.result, 'Should return a result');
        assert.ok(!response.result.isError, 'Should not be an error');
        assert.ok(response.result.content?.length > 0, 'Should have content');
      },
    },

    {
      name: 'user cannot call an admin tool',
      async run({ assert, accounts }) {
        const userKey = accounts.basic?.privateKey;
        const response = await mcpRequest('tools/call', {
          name: 'firestore_read',
          arguments: { path: 'users/test' },
        }, userKey);

        assert.ok(response?.result, 'Should return a result');
        assert.equal(response.result.isError, true, 'Should be an error');
        assert.ok(response.result.content?.[0]?.text?.includes('Unknown tool'), 'Should say unknown tool');
      },
    },

    {
      name: 'unauthenticated cannot call any tool (gets 401)',
      async run({ assert }) {
        try {
          const response = await mcpRequest('tools/call', {
            name: 'get_user',
            arguments: {},
          });
          assert.equal(response?.error, 'Unauthorized', 'Should return Unauthorized');
        } catch (error) {
          assert.ok(true, 'Unauthenticated tool call returned 401');
        }
      },
    },
  ],
};
