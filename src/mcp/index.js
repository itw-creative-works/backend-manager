#!/usr/bin/env node

/**
 * BEM MCP Server
 *
 * Exposes Backend Manager routes as MCP tools so Claude (or any MCP client)
 * can interact with a running BEM instance — local or production.
 *
 * Usage:
 *   npx bm mcp
 *
 * Environment variables:
 *   BEM_URL              - BEM server URL (default: http://localhost:5002)
 *   BACKEND_MANAGER_KEY  - Admin API key for authentication
 */
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const BEMClient = require('./client.js');
const tools = require('./tools.js');
const packageJSON = require('../../package.json');

/**
 * Start the MCP server
 * @param {object} options
 * @param {string} options.baseUrl - BEM server URL
 * @param {string} options.backendManagerKey - Admin API key
 */
async function startServer(options) {
  options = options || {};

  const baseUrl = options.baseUrl
    || process.env.BEM_URL
    || 'http://localhost:5002';
  const backendManagerKey = options.backendManagerKey
    || process.env.BACKEND_MANAGER_KEY
    || '';

  if (!backendManagerKey) {
    console.error('[BEM MCP] Warning: No BACKEND_MANAGER_KEY set. Admin routes will fail.');
  }

  const client = new BEMClient({ baseUrl, backendManagerKey });

  // Create the MCP server
  const server = new Server(
    {
      name: 'backend-manager',
      version: packageJSON.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Build a lookup map for tool definitions
  const toolMap = {};
  for (const tool of tools) {
    toolMap[tool.name] = tool;
  }

  // Handle tools/list — return all tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle tools/call — execute the requested tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap[name];

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const response = await client.call(tool.method, tool.path, args || {});

      // Format the response for the LLM
      const text = typeof response === 'string'
        ? response
        : JSON.stringify(response, null, 2);

      return {
        content: [{ type: 'text', text }],
      };
    } catch (error) {
      const message = error.response
        ? JSON.stringify(error.response, null, 2)
        : error.message;

      return {
        content: [{ type: 'text', text: `Error calling ${tool.path}: ${message}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`[BEM MCP] Server running — connected to ${baseUrl}`);
  console.error(`[BEM MCP] ${tools.length} tools available`);
}

// Allow direct execution or require
if (require.main === module) {
  startServer().catch((error) => {
    console.error('[BEM MCP] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { startServer };
