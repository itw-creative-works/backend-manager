/**
 * MCP HTTP Handler (Stateless + OAuth + Role-Based Scoping)
 *
 * Routes all MCP-related requests:
 * - OAuth discovery (.well-known endpoints)
 * - OAuth authorize + token (admin key auto-approve OR user sign-in via consumer website)
 * - MCP protocol (stateless Streamable HTTP transport, role-filtered tools)
 *
 * Compatible with serverless environments like Firebase Functions.
 */
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const builtinTools = require('./tools.js');
const BEMClient = require('./client.js');
const { resolveAuthInfo, filterToolsByRole, loadConsumerTools, buildToolMap } = require('./utils.js');
const packageJSON = require('../../package.json');

// Consumer tools are cached at module scope (loaded once per cold start)
let _consumerToolsCache = null;
let _consumerToolsCwd = null;

function getConsumerTools(cwd) {
  if (_consumerToolsCwd === cwd && _consumerToolsCache !== null) {
    return _consumerToolsCache;
  }

  _consumerToolsCache = loadConsumerTools(cwd);
  _consumerToolsCwd = cwd;

  return _consumerToolsCache;
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
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const baseUrl = `${protocol}://${host}`;

  // --- OAuth Discovery ---
  // issuer = root (no path) so RFC 8414 discovery resolves to /.well-known/oauth-authorization-server
  if (routePath === '.well-known/oauth-protected-resource') {
    return sendJson(res, 200, {
      resource: `${baseUrl}/backend-manager/mcp`,
      authorization_servers: [baseUrl],
    });
  }

  if (routePath === '.well-known/oauth-authorization-server') {
    return sendJson(res, 200, {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/backend-manager/mcp/authorize`,
      token_endpoint: `${baseUrl}/backend-manager/mcp/token`,
      registration_endpoint: `${baseUrl}/backend-manager/mcp/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  }

  // --- OAuth Dynamic Client Registration (RFC 7591) ---
  if (routePath === 'mcp/register') {
    return handleRegister(req, res);
  }

  // --- OAuth Authorize ---
  if (routePath === 'mcp/authorize') {
    return handleAuthorize(req, res, options, baseUrl);
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
 * Three paths:
 * 1. client_id matches admin key → auto-redirect (no form, no sign-in)
 * 2. No matching key → redirect to consumer's website for user sign-in
 * 3. Fallback → show manual key entry form
 */
function handleAuthorize(req, res, options, baseUrl) {
  const query = req.query || {};
  const { redirect_uri, state, client_id } = query;
  const Manager = options.Manager;

  // Auto-approve if client_id matches the admin key
  if (isAdminKey(client_id) && redirect_uri) {
    return redirectWithCode(res, redirect_uri, client_id, state);
  }

  // Try to redirect to consumer's website for user sign-in
  const consumerAuthUrl = resolveConsumerAuthUrl(Manager);

  if (consumerAuthUrl && redirect_uri) {
    const authUrl = new URL(consumerAuthUrl);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    if (state) {
      authUrl.searchParams.set('state', state);
    }
    authUrl.searchParams.set('mcp', 'true');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Fallback: show manual key entry form
  if (req.method === 'GET') {
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

    if (!isAdminKey(key)) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<html><body style="background:#111;color:#e55;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Invalid key. Go back and try again.</h2></body></html>');
      return;
    }

    if (!redirectUri) {
      return sendJson(res, 400, { error: 'Missing redirect_uri' });
    }

    return redirectWithCode(res, redirectUri, key, postState);
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

/**
 * OAuth Token — exchanges an auth code for an access token.
 *
 * Two paths:
 * 1. Code is the admin key → return it as access_token (existing behavior)
 * 2. Code is a Firebase ID token → verify, look up user, return api.privateKey
 */
async function handleToken(req, res, options) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = req.body || {};
  const code = body.code || body.client_secret || body.client_id || '';
  const Manager = options.Manager;

  // Path 1: admin key
  if (isAdminKey(code)) {
    return sendJson(res, 200, {
      access_token: code,
      token_type: 'Bearer',
      scope: 'tools',
    });
  }

  // Path 2: Firebase ID token → exchange for user's API key
  if (code) {
    try {
      const admin = Manager.libraries?.admin;

      if (!admin) {
        return sendJson(res, 500, {
          error: 'server_error',
          error_description: 'Firebase Admin not available.',
        });
      }

      const decoded = await admin.auth().verifyIdToken(code);
      const uid = decoded.uid;

      const userDoc = await admin.firestore().doc(`users/${uid}`).get();

      if (!userDoc.exists) {
        return sendJson(res, 401, {
          error: 'invalid_grant',
          error_description: 'User not found.',
        });
      }

      const userData = userDoc.data();
      let apiKey = userData?.api?.privateKey;

      // Generate an API key if the user doesn't have one
      if (!apiKey) {
        const { v4: uuidv4 } = require('uuid');
        apiKey = `pk_${uuidv4().replace(/-/g, '')}`;

        await admin.firestore().doc(`users/${uid}`).set(
          { api: { privateKey: apiKey } },
          { merge: true },
        );
      }

      return sendJson(res, 200, {
        access_token: apiKey,
        token_type: 'Bearer',
        scope: 'tools',
      });
    } catch (error) {
      return sendJson(res, 401, {
        error: 'invalid_grant',
        error_description: error.message || 'Invalid authorization code.',
      });
    }
  }

  sendJson(res, 401, {
    error: 'invalid_grant',
    error_description: 'Missing authorization code.',
  });
}

/**
 * OAuth Dynamic Client Registration (RFC 7591)
 * MCP clients register themselves before starting the auth flow.
 * We accept any client and return a generated client_id.
 */
function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { v4: uuidv4 } = require('uuid');
  const clientId = `mcp_${uuidv4().replace(/-/g, '')}`;

  sendJson(res, 201, {
    client_id: clientId,
    client_name: body.client_name || 'MCP Client',
    redirect_uris: body.redirect_uris || [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
}

/**
 * MCP Protocol — stateless Streamable HTTP transport with role-based tool filtering
 */
async function handleMcpProtocol(req, res, options) {
  const { Manager } = options;

  // Extract Bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  // No token → 401 to trigger the OAuth flow (MCP spec requires this)
  if (!token) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const baseUrl = `${protocol}://${host}`;
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Classify the token — fast check first, then DB lookup if needed
  const authInfo = resolveAuthInfo(token);

  // If token is a user API key, check if the user has admin role in Firestore
  if (authInfo.role === 'user') {
    try {
      const admin = Manager.libraries?.admin;

      if (admin) {
        const snapshot = await admin.firestore()
          .collection('users')
          .where('api.privateKey', '==', token)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();

          if (userData?.roles?.admin === true) {
            authInfo.role = 'admin';
            authInfo.authType = 'userAdmin';
          }
        }
      }
    } catch (e) {
      // DB lookup failed — proceed with user role (safe fallback)
    }
  }

  // Load and merge consumer tools (consumer overrides win)
  const cwd = Manager.cwd || '';
  const consumerTools = getConsumerTools(cwd);
  const toolMap = buildToolMap(builtinTools, consumerTools);
  const allTools = Array.from(toolMap.values());

  // Filter by role
  const visibleTools = filterToolsByRole(allTools, authInfo.role);

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

  // Build client with appropriate auth
  const apiUrl = Manager.getApiUrl();
  const client = new BEMClient({
    baseUrl: apiUrl,
    backendManagerKey: authInfo.role === 'admin' ? token : '',
    userToken: authInfo.role === 'user' ? token : '',
  });

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

  // List tools — role-filtered
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: visibleTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      })),
    };
  });

  // Call tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);

    // Defense-in-depth: tool must exist AND be in the visible set
    if (!tool || !visibleTools.some((t) => t.name === name)) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      // Handler-based consumer tools execute directly
      if (tool.handler && tool._consumer) {
        const result = await tool.handler({
          Manager,
          assistant: Manager.assistant,
          user: null,
          params: args || {},
          libraries: Manager.libraries,
        });

        const text = typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2);

        return {
          content: [{ type: 'text', text }],
        };
      }

      // Route-based tools call via HTTP
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
        content: [{ type: 'text', text: `Error calling ${name}: ${message}` }],
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

function isAdminKey(key) {
  const configKey = process.env.BACKEND_MANAGER_KEY || '';
  return !!key && !!configKey && key === configKey;
}

function resolveConsumerAuthUrl(Manager) {
  // Check backend-manager-config.json for explicit mcp.authUrl
  const mcpConfig = Manager.config?.mcp || {};

  if (mcpConfig.authUrl) {
    return mcpConfig.authUrl;
  }

  // Use getWebsiteUrl() — auto-resolves to localhost in dev/testing, production otherwise
  const websiteUrl = Manager.getWebsiteUrl ? Manager.getWebsiteUrl() : null;

  if (websiteUrl) {
    return `${websiteUrl.replace(/\/+$/, '')}/token`;
  }

  return null;
}

function redirectWithCode(res, redirectUri, code, state) {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) {
    url.searchParams.set('state', state);
  }
  res.writeHead(302, { Location: url.toString() });
  res.end();
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
