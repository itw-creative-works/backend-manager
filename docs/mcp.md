# Model Context Protocol (MCP)

BEM includes a built-in MCP server that exposes BEM routes as tools for Claude Chat, Claude Code, Claude Desktop, and other MCP clients. The MCP layer is a thin wrapper over the existing BEM API — every tool maps to a route, and authentication goes through the same middleware pipeline.

## Architecture

Two transport modes:
- **Stdio** (local): `npx mgr mcp` — for Claude Code / Claude Desktop
- **Streamable HTTP** (remote): `POST /backend-manager/mcp` — for Claude Chat / Claude Desktop custom connectors (stateless, Firebase Functions compatible)

## Roles

Every tool has a `role` that controls who can see and call it:

| Role | Who sees it | Tool count | Examples |
|------|-------------|------------|---------|
| `admin` | Admin key connections only | 22 | `firestore_read`, `send_email`, `cancel_subscription` |
| `user` | Authenticated users + admins | 2 | `get_user`, `get_subscription` |
| `public` | Everyone (after OAuth) | 1 | `health_check` |

Admin sees ALL tools. User sees `user` + `public`. Unauthenticated connections get a 401 that triggers the OAuth flow — there is no unauthenticated tool access. Defense-in-depth: even if someone calls an admin tool by name, the underlying BEM route still rejects.

## Available Tools (25)

| Tool | Role | Route | Description |
|------|------|-------|-------------|
| `firestore_read` | admin | `GET /admin/firestore` | Read a Firestore document by path |
| `firestore_write` | admin | `POST /admin/firestore` | Write/merge a Firestore document |
| `firestore_query` | admin | `POST /admin/firestore/query` | Query a collection with where/orderBy/limit |
| `send_email` | admin | `POST /admin/email` | Send transactional email via SendGrid |
| `send_notification` | admin | `POST /admin/notification` | Send push notification via FCM |
| `get_user` | user | `GET /user` | Get authenticated user info |
| `get_subscription` | user | `GET /user/subscription` | Get subscription info for a user |
| `sync_users` | admin | `POST /admin/users/sync` | Sync user data across systems |
| `list_campaigns` | admin | `GET /marketing/campaign` | List marketing campaigns |
| `create_campaign` | admin | `POST /marketing/campaign` | Create a marketing campaign |
| `get_stats` | admin | `GET /admin/stats` | Get system statistics |
| `cancel_subscription` | admin | `POST /payments/cancel` | Cancel subscription at period end |
| `refund_payment` | admin | `POST /payments/refund` | Process a refund |
| `get_payment_portal` | admin | `POST /payments/portal` | Generate Stripe billing portal link |
| `update_campaign` | admin | `PUT /marketing/campaign` | Update a pending campaign |
| `delete_campaign` | admin | `DELETE /marketing/campaign` | Delete a pending campaign |
| `create_contact` | admin | `POST /marketing/contact` | Add a marketing contact |
| `delete_contact` | admin | `DELETE /marketing/contact` | Remove a marketing contact |
| `run_cron` | admin | `POST /admin/cron` | Trigger a cron job by ID |
| `create_post` | admin | `POST /admin/post` | Create a blog post |
| `update_post` | admin | `PUT /admin/post` | Update an existing blog post |
| `create_backup` | admin | `POST /admin/backup` | Create a Firestore backup |
| `run_hook` | admin | `POST /admin/hook` | Execute a custom hook |
| `generate_uuid` | admin | `POST /general/uuid` | Generate a UUID |
| `health_check` | public | `GET /test/health` | Check server health |

## Tool Annotations

Every tool has MCP annotations that control how Claude Desktop categorizes and displays it:

| Field | Purpose |
|-------|---------|
| `title` | Human-readable display name (e.g. "Get authenticated user info" instead of `get_user`) |
| `readOnlyHint` | `true` → "Read-only tools" category in Claude Desktop |
| `destructiveHint` | `true` → marked as destructive (cancel, refund) |
| `idempotentHint` | `true` → safe to retry (firestore_write with merge) |
| `openWorldHint` | `true` → touches external systems (email, notifications) |

Consumer tools can set all the same annotations — they're passed through automatically.

## Authentication

### OAuth Flow (HTTP transport — Claude Desktop / Claude Chat)

1. Client sends `POST /backend-manager/mcp` with no auth → 401 with `WWW-Authenticate` header
2. Client discovers `/.well-known/oauth-protected-resource` → finds authorization server
3. Client discovers `/.well-known/oauth-authorization-server` → gets endpoints
4. Client registers via `POST /backend-manager/mcp/register` (RFC 7591 Dynamic Client Registration)
5. Client opens browser to `/backend-manager/mcp/authorize`
   - If `client_id` matches admin key → auto-redirects (admin access)
   - Otherwise → redirects to consumer's website (`/token?redirect_uri=...&state=...&mcp=true`)
6. User signs in on their familiar site, gets a Firebase ID token
7. Consumer's `/token` page redirects back with `code={idToken}&state={state}`
8. Client exchanges code: `POST /backend-manager/mcp/token` → BEM verifies ID token, returns `api.privateKey` as `access_token`
9. Client uses the API key for all future MCP requests as `Authorization: Bearer {key}`

The consumer auth URL is resolved from `Manager.getWebsiteUrl()` (auto-resolves localhost in dev, production domain otherwise), or overridden via `mcp.authUrl` in `backend-manager-config.json`.

### Admin (Stdio)

```bash
npx mgr mcp    # Reads BACKEND_MANAGER_KEY from functions/.env — sees all 25 tools
```

### User (Stdio)

```bash
npx mgr mcp --token <api-key>    # User-level — sees 3 tools (2 user + 1 public)
```

## Consumer MCP Tools

Consumer projects expose custom MCP tools via a single `functions/mcp.js` file. Tools are automatically discovered and merged with the built-in tools.

```js
// functions/mcp.js
module.exports = [
  // Route delegation — points at an existing route (works on stdio + HTTP)
  {
    name: 'get_sponsorship',
    description: 'Get sponsorship details by ID',
    role: 'user',
    method: 'GET',
    path: 'sponsorship',
    annotations: { title: 'Get sponsorship details', readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sponsorship ID' },
      },
      required: ['id'],
    },
  },

  // Handler mode — runs code directly (HTTP transport only)
  {
    name: 'newsletter_stats',
    description: 'Get newsletter stats for the past N days',
    role: 'admin',
    annotations: { title: 'Get newsletter stats', readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back', default: 30 },
      },
    },
    handler: async ({ Manager, assistant, user, params, libraries }) => {
      const cutoff = Date.now() - (params.days || 30) * 86400000;
      const snapshot = await libraries.admin.firestore()
        .collection('newsletters')
        .where('metadata.created.timestampUNIX', '>=', Math.floor(cutoff / 1000))
        .get();
      return { total: snapshot.docs.length };
    },
  },
];
```

**Rules:**
- Consumer tools with the same name as a built-in tool override it
- Every tool needs `name`, `description`, and either `path` (route delegation) or `handler` (direct execution)
- `role` defaults to `admin` if not specified
- Handler-based tools only work on the HTTP transport (they return an error on stdio)
- Handler-based tools bypass BEM route middleware — they execute directly with the Manager context
- All MCP-standard fields are passed through: `annotations`, `outputSchema`, `inputSchema`

## HTTPS Local Development

`npx mgr serve` starts an HTTPS proxy on port 5002 (firebase serve runs internally on 5443). This enables Claude Desktop to connect locally since it requires HTTPS.

- Certificates are auto-generated via mkcert into `.temp/certs/`
- `getApiUrl()` returns `https://localhost:5002` when the HTTPS proxy is active
- Disable with `--no-https` to fall back to plain HTTP
- Install mkcert: `brew install mkcert && mkcert -install`

## Hosting Rewrites

The `npx mgr setup` command automatically adds required Firebase Hosting rewrites for MCP OAuth:

```json
{
  "source": "{/backend-manager,/backend-manager/**,/.well-known/oauth-protected-resource,/.well-known/oauth-authorization-server,/authorize,/token}",
  "function": "bm_api"
}
```

## Claude Desktop Configuration

1. Go to Settings → Integrations → Add Custom Integration
2. **URL:** `https://api.yourdomain.com/backend-manager/mcp` (production) or `https://localhost:5002/backend-manager/mcp` (local dev with HTTPS proxy)
3. For admin access: set **OAuth Client ID** to your `BACKEND_MANAGER_KEY`
4. For user access: leave Client ID empty — the OAuth flow redirects to the consumer's website for sign-in

## Claude Code Configuration

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "backend-manager": {
      "command": "npx",
      "args": ["bm", "mcp"],
      "cwd": "/path/to/consumer-project"
    }
  }
}
```

## Key Files

| Purpose | File |
|---------|------|
| Tool definitions (roles + annotations) | `src/mcp/tools.js` |
| Shared utilities (auth, filtering, consumer loading) | `src/mcp/utils.js` |
| HTTP handler (OAuth + roles + consumer tools) | `src/mcp/handler.js` |
| Stdio server | `src/mcp/index.js` |
| HTTP client | `src/mcp/client.js` |
| CLI command | `src/cli/commands/mcp.js` |
| HTTPS proxy for local dev | `src/cli/commands/serve.js` |
| MCP route interception | `src/manager/index.js` (`_handleMcp`, `resolveMcpRoutePath`) |
| Hosting rewrites setup | `src/cli/commands/setup-tests/hosting-rewrites.js` |

## Adding New Tools

### Built-in tools (in BEM itself)

Add a tool definition to `src/mcp/tools.js` with `name`, `description`, `role`, `method`, `path`, `annotations`, and `inputSchema`. The tool automatically maps to the corresponding BEM route via the HTTP client.

### Consumer tools (in a consumer project)

Add an entry to `functions/mcp.js`. Use `path` + `method` for route delegation (works on both transports), or `handler` for direct execution (HTTP only). All MCP fields (`annotations`, `outputSchema`, etc.) are passed through automatically.
