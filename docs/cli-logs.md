# CLI: Logs Commands

Fetch or stream Cloud Function logs from Google Cloud Logging. Requires `gcloud` CLI installed and authenticated. Auto-resolves the project ID from `service-account.json`, `.firebaserc`, or `GCLOUD_PROJECT`.

> All `npx mgr ...` commands must be run from the consumer project's `functions/` subdirectory. See [docs/cli-firestore-auth.md](cli-firestore-auth.md) for the explanation.

## Commands

```bash
npx mgr logs:read                                     # Read last 1h of logs (default: 300 entries, newest first)
npx mgr logs:read --fn bm_api                         # Filter by function name
npx mgr logs:read --fn bm_api --severity ERROR        # Filter by severity (DEBUG, INFO, WARNING, ERROR, CRITICAL)
npx mgr logs:read --since 2d --limit 100              # Custom time range and limit
npx mgr logs:read --search "72.134.242.25"            # Search textPayload for a string (IP, email, error, etc.)
npx mgr logs:read --fn bm_authBeforeCreate --search "ian@example.com" --since 7d  # Combined filters
npx mgr logs:read --order asc                         # Oldest first (default: desc/newest first)
npx mgr logs:read --filter 'jsonPayload.level="error"'  # Raw gcloud filter passthrough
npx mgr logs:tail                                     # Stream live logs
npx mgr logs:tail --fn bm_paymentsWebhookOnWrite      # Stream filtered live logs
```

Both commands save output to `functions/logs.log` (overwritten on each run). `logs:read` saves raw JSON; `logs:tail` streams text.

**Cloud Logs vs Local Logs:** These commands query **production** Google Cloud Logging. For **local/dev** logs, read `functions/serve.log` (from `npx mgr serve`) or `functions/emulator.log` (from `npx mgr test`) directly — they are plain text files, not gcloud.

## Flags

| Flag | Description | Default | Commands |
|------|-------------|---------|----------|
| `--fn <name>` | Filter by Cloud Function name (see table below) | all | both |
| `--severity <level>` | Minimum severity: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` | all | both |
| `--search <text>` | Search textPayload for a substring (IP, email, uid, error message) | none | both |
| `--filter <expr>` | Raw gcloud logging filter expression (appended to built-in filters) | none | both |
| `--since <duration>` | Time range (`30m`, `1h`, `2d`, `1w`) | `1h` | read only |
| `--limit <n>` | Max entries | `300` | read only |
| `--order <dir>` | Sort order: `asc` (oldest first) or `desc` (newest first) | `desc` | read only |
| `--interval <sec>` | Polling interval in seconds | `5` | tail only |
| `--raw` | Output raw JSON | false | both |

## `--fn` Function Name Reference

The `--fn` flag uses the **deployed Cloud Function name**, not the route path.

**BEM built-in functions (always deployed):**

| Function name | Type | Description |
|---------------|------|-------------|
| `bm_api` | HTTPS | Main API router — all consumer routes (GET/POST/PUT/DELETE) go through this |
| `bm_authBeforeCreate` | Auth blocking | Before user creation: disposable email blocking, IP rate limiting, consumer hooks |
| `bm_authBeforeSignIn` | Auth blocking | Before sign-in: consumer hooks |
| `bm_authOnCreate` | Auth event | After user creation: user doc setup |
| `bm_authOnDelete` | Auth event | After user deletion |
| `bm_paymentsWebhookOnWrite` | Firestore trigger | Processes payment webhooks |
| `bm_paymentsDisputeOnWrite` | Firestore trigger | Processes payment disputes |
| `bm_notificationsOnWrite` | Firestore trigger | Sends push notifications |
| `bm_cronDaily` | Scheduled | Daily cron (midnight UTC) |
| `bm_cronFrequent` | Scheduled | Frequent cron (every 10 min) |

**Consumer-defined functions** use the export name from `functions/index.js` (e.g., `exports.items = ...` → `--fn items`).

**Quick lookup — which function to query:**
- API route errors → `--fn bm_api`
- Signup/auth blocked → `--fn bm_authBeforeCreate`
- Sign-in issues → `--fn bm_authBeforeSignIn`
- User doc not created → `--fn bm_authOnCreate`
- Payment not processing → `--fn bm_paymentsWebhookOnWrite`
- Cron job issues → `--fn bm_cronDaily` or `--fn bm_cronFrequent`
