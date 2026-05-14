# CLI: Firestore & Auth Commands

Quick commands for reading/writing Firestore and managing Auth users directly from the terminal. Works in any BEM consumer project (requires `functions/service-account.json` for production, or `--emulator` for local).

**IMPORTANT: All CLI commands (`npx mgr ...`) MUST be run from the consumer project's `functions/` subdirectory** (e.g., `cd /path/to/my-project/functions && npx mgr ...`). The `mgr` binary lives in `functions/node_modules/.bin/` — running from the project root or any other directory will fail.

For log commands, see [docs/cli-logs.md](cli-logs.md).

## Firestore Commands

```bash
npx mgr firestore:get <path>                          # Read a document
npx mgr firestore:set <path> '<json>'                 # Write/merge a document
npx mgr firestore:set <path> '<json>' --no-merge      # Overwrite a document entirely
npx mgr firestore:query <collection>                  # Query a collection (default limit 25)
  --where "field==value"                              #   Filter (repeatable for AND)
  --orderBy "field:desc"                              #   Sort
  --limit N                                           #   Limit results
npx mgr firestore:delete <path>                       # Delete a document (prompts for confirmation)
```

## Auth Commands

```bash
npx mgr auth:get <uid-or-email>                       # Get user by UID or email (auto-detected via @)
npx mgr auth:list [--limit N] [--page-token T]        # List users (default 100)
npx mgr auth:delete <uid-or-email>                    # Delete user (prompts for confirmation)
npx mgr auth:set-claims <uid-or-email> '<json>'       # Set custom claims
```

## Shared Flags

| Flag | Description |
|------|-------------|
| `--emulator` | Target local emulator instead of production |
| `--force` | Skip confirmation on destructive operations |
| `--raw` | Compact JSON output (for piping to `jq` etc.) |

## Examples

```bash
# Read a user document from production
npx mgr firestore:get users/abc123

# Write to emulator
npx mgr firestore:set users/test123 '{"name":"Test User"}' --emulator

# Query with filters
npx mgr firestore:query users --where "subscription.status==active" --limit 10

# Look up auth user by email
npx mgr auth:get user@example.com

# Set admin claims
npx mgr auth:set-claims user@example.com '{"admin":true}'

# Delete from emulator (no confirmation needed)
npx mgr firestore:delete users/test123 --emulator
```
