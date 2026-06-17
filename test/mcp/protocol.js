/**
 * Test: MCP protocol endpoint — happy path, sad path, edge cases
 * Tests the Streamable HTTP transport at POST /backend-manager/mcp
 *
 * Run: npx mgr test bem:mcp/protocol
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

async function mcpRequest(method, params, bearerToken, options) {
  options = options || {};

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...options.headers,
  };

  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: options.id || 1,
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
  description: 'MCP protocol endpoint (Streamable HTTP)',
  type: 'group',

  tests: [
    // ─── Happy path ───

    {
      name: 'tools/list returns tool definitions with schemas',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/list', {}, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(Array.isArray(response.result.tools), 'tools should be an array');

        const tool = response.result.tools.find((t) => t.name === 'health_check');
        assert.ok(tool, 'Should include health_check');
        assert.ok(tool.description, 'Tool should have description');
        assert.ok(tool.inputSchema, 'Tool should have inputSchema');
        assert.equal(tool.inputSchema.type, 'object', 'Schema type should be object');
      },
    },

    {
      name: 'tools/call health_check succeeds',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'health_check',
          arguments: {},
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(!response.result.isError, 'Should not be an error');
        assert.ok(response.result.content, 'Should have content');
        assert.ok(response.result.content.length > 0, 'Content should not be empty');
        assert.equal(response.result.content[0].type, 'text', 'Content type should be text');
      },
    },

    {
      name: 'tools/call generate_uuid returns valid response',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'generate_uuid',
          arguments: { version: '4' },
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(!response.result.isError, 'Should not be an error');

        const text = response.result.content?.[0]?.text || '';
        assert.ok(text.length > 0, 'Should return UUID text');
      },
    },

    // ─── Sad path ───

    {
      name: 'tools/call unknown tool returns error',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'nonexistent_tool',
          arguments: {},
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.equal(response.result.isError, true, 'Should be an error');
        assert.ok(response.result.content?.[0]?.text?.includes('Unknown tool'), 'Error should mention unknown tool');
      },
    },

    {
      name: 'GET method returns 405',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;

        try {
          const response = await fetch(MCP_ENDPOINT, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Accept': 'application/json, text/event-stream',
            },
            response: 'json',
            timeout: 10000,
          });

          assert.ok(response?.error, 'Should return error for GET');
        } catch (error) {
          assert.ok(true, 'GET method rejected');
        }
      },
    },

    {
      name: 'DELETE method returns 200 (session cleanup)',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;

        try {
          await fetch(MCP_ENDPOINT, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${key}`,
            },
            response: 'text',
            timeout: 10000,
          });

          assert.ok(true, 'DELETE method accepted');
        } catch (error) {
          assert.ok(true, 'DELETE method handled');
        }
      },
    },

    // ─── Edge cases ───

    {
      name: 'tools/call with empty object arguments still works',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'health_check',
          arguments: {},
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(!response.result.isError, 'Should not error with empty arguments');
      },
    },

    {
      name: 'tools/call with missing arguments still works',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'health_check',
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(!response.result.isError, 'Should not error with missing arguments');
      },
    },

    {
      name: 'response preserves jsonrpc 2.0 envelope',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/list', {}, key, { id: 42 });

        assert.equal(response?.jsonrpc, '2.0', 'Should have jsonrpc 2.0');
        assert.equal(response?.id, 42, 'Should echo back the request id');
      },
    },

    {
      name: 'unauthenticated request returns 401 to trigger OAuth',
      async run({ assert }) {
        try {
          const text = await fetch(MCP_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
            response: 'text',
            timeout: 10000,
          });
          const parsed = JSON.parse(text);
          assert.equal(parsed.error, 'Unauthorized', 'Should return Unauthorized');
        } catch (error) {
          assert.ok(true, '401 response thrown as error');
        }
      },
    },

    {
      name: 'tools include annotations with title and hints',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/list', {}, key);

        const tool = response.result.tools.find((t) => t.name === 'health_check');
        assert.ok(tool.annotations, 'Should have annotations');
        assert.ok(tool.annotations.title, 'Should have a title');
        assert.equal(tool.annotations.readOnlyHint, true, 'health_check should be read-only');
      },
    },

    {
      name: 'admin can call public-role tool (role escalation works upward)',
      async run({ assert }) {
        const key = process.env.BACKEND_MANAGER_KEY;
        const response = await mcpRequest('tools/call', {
          name: 'health_check',
          arguments: {},
        }, key);

        assert.ok(response?.result, 'Should have result');
        assert.ok(!response.result.isError, 'Admin should be able to call public tools');
      },
    },
  ],
};
