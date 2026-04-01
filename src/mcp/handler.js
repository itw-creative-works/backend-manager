/**
 * MCP HTTP Handler (Stateless + OAuth)
 *
 * Routes all MCP-related requests:
 * - OAuth discovery (.well-known endpoints)
 * - OAuth authorize + token (wraps backendManagerKey as OAuth token)
 * - MCP protocol (stateless Streamable HTTP transport)
 *
 * Compatible with serverless environments like Firebase Functions.
 * No tokens stored — the backendManagerKey IS the access token.
 */
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const tools = require('./tools.js');
const BEMClient = require('./client.js');
const packageJSON = require('../../package.json');

// Build tool lookup once
const toolMap = {};
for (const tool of tools) {
  toolMap[tool.name] = tool;
}

/**
 * Route all MCP-related requests
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {object} options
 * @param {object} options.Manager - BEM Manager instance
 * @param {string} options.routePath - Resolved route path (e.g. "mcp", "mcp/authorize")
 */
async function handleMcpRoute(req, res, options) {
  const { Manager, routePath } = options;
  // Build base URL from the incoming request so discovery URLs match however the client reached us
  // (ngrok, production domain, localhost, etc.)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const baseUrl = `${protocol}://${host}`;

  // --- OAuth Discovery ---
  if (routePath === '.well-known/oauth-protected-resource') {
    return sendJson(res, 200, {
      resource: `${baseUrl}/backend-manager/mcp`,
      authorization_servers: [
        `${baseUrl}/backend-manager/mcp`,
      ],
    });
  }

  if (routePath === '.well-known/oauth-authorization-server') {
    return sendJson(res, 200, {
      issuer: `${baseUrl}/backend-manager/mcp`,
      authorization_endpoint: `${baseUrl}/backend-manager/mcp/authorize`,
      token_endpoint: `${baseUrl}/backend-manager/mcp/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  }

  // --- OAuth Authorize ---
  if (routePath === 'mcp/authorize') {
    return handleAuthorize(req, res, options);
  }

  // --- OAuth Token ---
  if (routePath === 'mcp/token') {
    return handleToken(req, res, options);
  }

  // --- MCP Protocol ---
  if (routePath === 'mcp') {
    return handleMcpProtocol(req, res, options);
  }

  sendJson(res, 404, { error: 'Not found' });
}

/**
 * OAuth Authorize
 *
 * If client_id matches the BEM key, auto-redirects immediately (no form).
 * Otherwise, shows a simple form to enter the key manually.
 *
 * To skip the manual step, set OAuth Client ID = YOUR_BEM_KEY in Claude Chat.
 */
function handleAuthorize(req, res, options) {
  const query = req.query || {};
  const { redirect_uri, state, client_id } = query;
  const Manager = options.Manager;

  // Auto-approve if client_id matches the BEM key
  if (isValidKey(client_id, Manager) && redirect_uri) {
    const url = new URL(redirect_uri);
    url.searchParams.set('code', client_id);
    if (state) {
      url.searchParams.set('state', state);
    }
    res.writeHead(302, { Location: url.toString() });
    res.end();
    return;
  }

  if (req.method === 'GET') {
    // Show a simple authorize form (fallback when client_id is not the BEM key)
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Backend Manager — Authorize MCP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 32px; max-width: 420px; width: 100%; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { font-size: 14px; color: #999; margin-bottom: 24px; }
    label { font-size: 13px; color: #aaa; display: block; margin-bottom: 6px; }
    input[type="password"] { width: 100%; padding: 10px 12px; background: #222; border: 1px solid #444; border-radius: 6px; color: #eee; font-size: 14px; }
    input[type="password"]:focus { outline: none; border-color: #7c6df0; }
    button { margin-top: 20px; width: 100%; padding: 10px; background: #7c6df0; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    button:hover { background: #6b5de0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize MCP Connection</h1>
    <p>Enter your Backend Manager key to allow Claude to connect.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri || '')}">
      <input type="hidden" name="state" value="${escapeHtml(state || '')}">
      <label for="key">Backend Manager Key</label>
      <input type="password" id="key" name="key" placeholder="Enter your key" required autofocus>
      <button type="submit">Allow</button>
    </form>
  </div>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // POST — validate key and redirect back with code
  if (req.method === 'POST') {
    const body = req.body || {};
    const key = body.key || '';
    const redirectUri = body.redirect_uri || '';
    const postState = body.state || '';

    if (!isValidKey(key, Manager)) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<html><body style="background:#111;color:#e55;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Invalid key. Go back and try again.</h2></body></html>');
      return;
    }

    if (!redirectUri) {
      return sendJson(res, 400, { error: 'Missing redirect_uri' });
    }

    const url = new URL(redirectUri);
    url.searchParams.set('code', key);
    if (postState) {
      url.searchParams.set('state', postState);
    }

    res.writeHead(302, { Location: url.toString() });
    res.end();
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

/**
 * OAuth Token — exchanges the auth code (BEM key) for an access token (same BEM key)
 */
function handleToken(req, res, options) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = req.body || {};
  const code = body.code || body.client_secret || body.client_id || '';
  const Manager = options.Manager;

  // The code, client_secret, or client_id IS the backendManagerKey — validate any
  if (!isValidKey(code, Manager)) {
    return sendJson(res, 401, {
      error: 'invalid_grant',
      error_description: 'Invalid authorization code.',
    });
  }

  // Return the key as the access token — no storage needed
  sendJson(res, 200, {
    access_token: code,
    token_type: 'Bearer',
    scope: 'tools',
  });
}

/**
 * MCP Protocol — stateless Streamable HTTP transport
 */
async function handleMcpProtocol(req, res, options) {
  const { Manager } = options;

  // Authenticate via Bearer token
  const authHeader = req.headers.authorization || '';
  const key = authHeader.replace(/^Bearer\s+/i, '');

  if (!isValidKey(key, Manager)) {
    // Return 401 with OAuth discovery hint
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const baseUrl = `${protocol}://${host}`;
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/backend-manager/.well-known/oauth-protected-resource"`,
    });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Only POST supported in stateless mode
  if (req.method !== 'POST') {
    if (req.method === 'DELETE') {
      res.writeHead(200);
      res.end();
      return;
    }
    return sendJson(res, 405, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST.' },
    });
  }

  // Determine the API URL for internal HTTP calls
  const apiUrl = Manager.project?.apiUrl || 'http://localhost:5002';
  const client = new BEMClient({ baseUrl: apiUrl, backendManagerKey: key });

  // Create a fresh stateless transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  // Create MCP server
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

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Call tools
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

  // Connect and handle
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  // Clean up
  await transport.close();
  await server.close();
}

// --- Helpers ---

/**
 * Validate a key against the configured backendManagerKey.
 * Returns false if either the key or the config key is empty/missing.
 */
function isValidKey(key, Manager) {
  const configKey = Manager.config?.backendManagerKey;
  return !!key && !!configKey && key === configKey;
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { handleMcpRoute };
