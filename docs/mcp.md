# Model Context Protocol (MCP)

BEM includes a built-in MCP server that exposes BEM routes as tools for Claude Chat, Claude Code, and other MCP clients.

## Architecture

Two transport modes:
- **Stdio** (local): `npx mgr mcp` — for Claude Code / Claude Desktop
- **Streamable HTTP** (remote): `POST /backend-manager/mcp` — for Claude Chat (stateless, Firebase Functions compatible)

## Available Tools (19)

| Tool | Route | Description |
|------|-------|-------------|
| `firestore_read` | `GET /admin/firestore` | Read a Firestore document by path |
| `firestore_write` | `POST /admin/firestore` | Write/merge a Firestore document |
| `firestore_query` | `POST /admin/firestore/query` | Query a collection with where/orderBy/limit |
| `send_email` | `POST /admin/email` | Send transactional email via SendGrid |
| `send_notification` | `POST /admin/notification` | Send push notification via FCM |
| `get_user` | `GET /user` | Get authenticated user info |
| `get_subscription` | `GET /user/subscription` | Get subscription info for a user |
| `sync_users` | `POST /admin/users/sync` | Sync user data across systems |
| `list_campaigns` | `GET /marketing/campaign` | List marketing campaigns |
| `create_campaign` | `POST /marketing/campaign` | Create a marketing campaign |
| `get_stats` | `GET /admin/stats` | Get system statistics |
| `cancel_subscription` | `POST /payments/cancel` | Cancel subscription at period end |
| `refund_payment` | `POST /payments/refund` | Process a refund |
| `run_cron` | `POST /admin/cron` | Trigger a cron job by ID |
| `create_post` | `POST /admin/post` | Create a blog post |
| `create_backup` | `POST /admin/backup` | Create a Firestore backup |
| `run_hook` | `POST /admin/hook` | Execute a custom hook |
| `generate_uuid` | `POST /general/uuid` | Generate a UUID |
| `health_check` | `GET /test/health` | Check server health |

## Authentication

- **Stdio (local):** Reads `BACKEND_MANAGER_KEY` from `functions/.env` automatically
- **HTTP (remote):** OAuth 2.1 Authorization Code flow with PKCE. Claude Chat handles the flow — user pastes BEM key once on the authorize page. If `OAuth Client ID` is set to the BEM key in the connector config, the authorize step auto-approves.

## Hosting Rewrites

The `npx mgr setup` command automatically adds required Firebase Hosting rewrites for MCP OAuth:

```json
{
  "source": "{/backend-manager,/backend-manager/**,/.well-known/oauth-protected-resource,/.well-known/oauth-authorization-server,/authorize,/token}",
  "function": "bm_api"
}
```

## CLI Usage

```bash
npx mgr mcp                    # Start stdio MCP server (for Claude Code)
```

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

## Claude Chat Configuration

1. Go to Settings → Custom Connectors → Add
2. **URL:** `https://api.yourdomain.com/backend-manager/mcp`
3. **OAuth Client ID:** your `BACKEND_MANAGER_KEY` (enables auto-approve)
4. **OAuth Client Secret:** your `BACKEND_MANAGER_KEY`

## Key Files

| Purpose | File |
|---------|------|
| Tool definitions | `src/mcp/tools.js` |
| HTTP handler (stateless + OAuth) | `src/mcp/handler.js` |
| Stdio server | `src/mcp/index.js` |
| HTTP client | `src/mcp/client.js` |
| CLI command | `src/cli/commands/mcp.js` |
| MCP route interception | `src/manager/index.js` (`_handleMcp`, `resolveMcpRoutePath`) |
| Hosting rewrites setup | `src/cli/commands/setup-tests/hosting-rewrites.js` |

## Adding New Tools

1. Add the tool definition to `src/mcp/tools.js` with `name`, `description`, `method`, `path`, and `inputSchema`
2. The tool automatically maps to the corresponding BEM route via the HTTP client — no handler code needed
