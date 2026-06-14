# MCP Role-Based Tool Scoping + Consumer Extensibility

## Context

The BEM MCP server currently works only for admins — a single `BACKEND_MANAGER_KEY` grants access to all 19 tools. Regular users can't connect at all, and consumer BEM projects have no way to add custom MCP tools. This plan adds:

1. **Role-based tool scoping** — tools tagged `admin`, `user`, or `public`; connections only see tools matching their role
2. **User authentication** — seamless OAuth sign-in flow + API key as long-lived credential
3. **Consumer MCP tools** — a single `functions/mcp.js` file in consumer projects

## Architecture

### Role Model

Every tool gets a `role` field:

| Role | Who sees it | Examples |
|------|-------------|---------|
| `admin` | Admin key connections only | firestore_read, send_email, run_cron |
| `user` | Authenticated users + admins | get_user, get_subscription, cancel_subscription |
| `public` | Everyone (including unauthenticated) | generate_uuid, health_check |

Admin sees ALL tools. User sees `user` + `public`. Unauthenticated sees only `public`. Defense-in-depth — even if someone calls an admin tool by name, the route still rejects with 403.

### Auth: How Users Connect (OAuth + Consumer's Website)

**The key insight:** users already have an API key (`api.privateKey`) on their Firestore account doc. It's long-lived, already works with `assistant.authenticate()`, and already encodes identity + access level. This is the credential.

**The UX:** Claude Code/Desktop opens a browser → user signs in on their familiar site → redirected back to Claude. Done. No copy-pasting tokens.

**The OAuth flow (step by step):**

```
1. Claude discovers endpoints:
   GET /.well-known/oauth-authorization-server
   → { authorization_endpoint, token_endpoint, ... }

2. Claude opens browser to BEM authorize endpoint:
   GET /backend-manager/mcp/authorize?redirect_uri=CLAUDE_CALLBACK&state=STATE

3. BEM authorize checks the request:
   - If client_id === BACKEND_MANAGER_KEY → auto-redirect (admin, unchanged)
   - Otherwise → redirect to consumer's /token page:
     https://app.example.com/token?redirect_uri=CLAUDE_CALLBACK&state=STATE

4. User lands on their familiar website sign-in page.
   Signs in with Google / email+password / whatever.
   After sign-in, page gets Firebase ID token via webManager.auth().getIdToken()

5. Consumer's /token page redirects to CLAUDE_CALLBACK:
   CLAUDE_CALLBACK?code=FIREBASE_ID_TOKEN&state=STATE

6. Claude exchanges code for access token:
   POST /backend-manager/mcp/token
   { code: FIREBASE_ID_TOKEN }

7. BEM token endpoint:
   - If code === BACKEND_MANAGER_KEY → return it as access_token (admin, unchanged)
   - Otherwise → verify Firebase ID token with admin.auth().verifyIdToken()
     → look up user doc → return user's api.privateKey as access_token

8. Claude uses the API key for all future MCP requests:
   Authorization: Bearer {api.privateKey}
```

**Why API key, not JWT:**
- Firebase ID tokens expire in 1 hour — MCP connection would break constantly
- The API key never expires (until regenerated)
- `assistant.authenticate()` already handles API key → user lookup
- User can revoke by regenerating from account settings

**Why redirect to consumer's website instead of embedding Firebase Auth:**
- User sees their familiar sign-in page (branded, trusted)
- No need to embed Firebase Auth SDK in BEM's authorize HTML
- UJM already has a `/token` page — just needs a small update to support `redirect_uri` param
- Works with any auth provider the consumer has configured

### Auth Classification (Fast, No DB Call)

`resolveAuthInfo(token)` classifies the Bearer token for tool filtering:

- Token matches `BACKEND_MANAGER_KEY` → `role: 'admin'`
- Any other non-empty token → `role: 'user'` (API key from the OAuth flow)
- No token → `role: 'public'`

No DB call needed — actual validation happens at the route level when a tool is called.

### Consumer MCP Tools

Consumer tools live in a **single file**: `functions/mcp.js`. Keeps things simple since most consumer MCP tools are just route delegations pointing at routes already defined in `functions/routes/`.

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
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sponsorship ID' },
      },
      required: ['id'],
    },
  },

  // Handler mode — runs code directly (HTTP transport only, has full Manager context)
  {
    name: 'newsletter_stats',
    description: 'Get newsletter stats for the past N days',
    role: 'admin',
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

Consumer tools with the same name as a built-in tool override it (same precedence as consumer routes).

## File Changes

### 1. `src/mcp/tools.js` — Add `role` to every tool

| Tool | Role |
|------|------|
| `firestore_read/write/query` | `admin` |
| `send_email`, `send_notification` | `admin` |
| `sync_users`, `list_campaigns`, `create_campaign` | `admin` |
| `get_stats`, `run_cron`, `create_post`, `create_backup`, `run_hook` | `admin` |
| `get_user`, `get_subscription` | `user` |
| `cancel_subscription`, `refund_payment` | `user` |
| `generate_uuid`, `health_check` | `public` |

### 2. NEW: `src/mcp/utils.js` — Shared utilities

- **`resolveAuthInfo(token)`** — classifies token → `{ role, authType, token }`. Admin key check is instant; everything else = user.
- **`filterToolsByRole(tools, role)`** — admin→all, user→user+public, public→public only.
- **`loadConsumerTools(cwd)`** — checks for `${cwd}/mcp.js`, `require()`s it if it exists, validates shape, returns array.
- **`buildToolMap(builtinTools, consumerTools)`** — merges into a Map; consumer tools override same-name built-ins.

### 3. `src/mcp/client.js` — Support user auth tokens

Extend constructor to accept `{ baseUrl, backendManagerKey, userToken }`.

In `call()`:
- Has `backendManagerKey` → current behavior (key in query/body)
- Has `userToken` (no backendManagerKey) → put token in `Authorization: Bearer` header + `authenticationToken` query param for GET
- Neither → unauthenticated request

### 4. `src/mcp/index.js` — Stdio server with role filtering

- Import utils, call `resolveAuthInfo()` to determine role
- Call `loadConsumerTools(options.cwd)` if `cwd` is provided
- Merge + filter tools by role in `ListToolsRequestSchema` handler
- In `CallToolRequestSchema`: `path`-based tools via BEMClient. Handler-only tools return error explaining they require HTTP transport.
- Accept new `options.token` for user connections

### 5. `src/mcp/handler.js` — HTTP handler with OAuth user flow

**`handleAuthorize()`** — the big change:
- If `client_id` matches admin key → auto-redirect (current behavior, unchanged)
- Otherwise → **redirect to consumer's website** for sign-in:
  - Build consumer auth URL from `Manager.config.brand.url` (or a configurable `mcp.authUrl` in backend-manager-config.json)
  - Redirect to: `{consumerUrl}/token?redirect_uri={originalRedirectUri}&state={state}`
  - The consumer's `/token` page handles sign-in, gets Firebase ID token, redirects back to Claude's callback

**`handleToken()`** — exchanges Firebase ID token for API key:
- If code matches admin key → return as `access_token` (unchanged)
- Otherwise → treat code as Firebase ID token:
  1. `admin.auth().verifyIdToken(code)` to get UID
  2. `admin.firestore().doc('users/{uid}').get()` to get user doc
  3. Return `user.api.privateKey` as the `access_token`
  4. If user has no API key, generate one and save it

**`handleMcpProtocol()`** — role-based tool filtering:
- Extract Bearer token, call `resolveAuthInfo()`
- Allow public connections (no 401 for empty tokens — just show public tools)
- Discover + merge consumer tools (cached at module scope)
- Filter tools by role in `ListToolsRequestSchema`
- In `CallToolRequestSchema`:
  - `path`-based tools: BEMClient HTTP call (current behavior)
  - `handler`-based tools: execute directly with `{ Manager, assistant, user, params, libraries }`

**Rename `isValidKey()` → `isAdminKey()`** for clarity.

### 6. `src/cli/commands/mcp.js` — New CLI flags

- `--token` (`-t`): user's API key (for user-level connections)
- Pass `cwd: functionsDir` to `startServer()` for consumer tool discovery
- When `--token` is provided, create BEMClient with userToken instead of backendManagerKey

### 7. Consumer's UJM `/token` page — Small update (separate repo)

The UJM `/token` page needs to support the MCP OAuth redirect flow:
- Detect `redirect_uri` and `state` query params
- After sign-in, get Firebase ID token via `webManager.auth().getIdToken()`
- Redirect to `redirect_uri?code={idToken}&state={state}`

This is a small addition to the existing `/token` page layout. Files:
- `ultimate-jekyll-manager/src/defaults/dist/_layouts/blueprint/auth/token.html`
- `ultimate-jekyll-manager/src/defaults/dist/_layouts/themes/classy/frontend/pages/auth/token.html`

### 8. `docs/mcp.md` — Documentation

- Add "Roles" section explaining admin/user/public scoping
- Add "User Authentication" section with the OAuth flow diagram
- Add "Consumer MCP Tools" section with `functions/mcp.js` format + examples
- Add CLI examples for user connections
- Add guide for configuring the consumer auth URL

## Implementation Order

1. `src/mcp/utils.js` (new) — foundation utilities
2. `src/mcp/tools.js` — add `role` to all 19 tools
3. `src/mcp/client.js` — user token support
4. `src/mcp/index.js` — stdio role filtering + consumer tools
5. `src/cli/commands/mcp.js` — new CLI flags
6. `src/mcp/handler.js` — HTTP role filtering + OAuth user flow + consumer tool handlers
7. UJM `/token` page update (separate repo)
8. `docs/mcp.md` — documentation

## Verification

1. **Existing admin flow**: `npx mgr mcp` with `BACKEND_MANAGER_KEY` → all 19 tools listed, all callable
2. **User flow (stdio)**: `npx mgr mcp --token <api-key>` → only user+public tools listed
3. **Public flow**: `npx mgr mcp` (no key, no token) → only public tools listed
4. **Consumer tools**: Create `functions/mcp.js` in a consumer project → tools appear in listing
5. **HTTP OAuth flow**: Connect from Claude Code/Desktop → redirected to consumer site → sign in → redirected back → user tools available
6. **Token exchange**: POST to `/mcp/token` with Firebase ID token → returns API key as access_token
7. **Role enforcement**: User calling an admin tool by name → unknown tool error (tool not in filtered list)
8. **Run `npx mgr test`** to verify no regressions
