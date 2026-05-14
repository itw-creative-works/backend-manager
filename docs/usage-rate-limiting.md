# Usage & Rate Limiting

## Overview

Usage is tracked per-metric (e.g., `requests`, `sponsorships`) with four fields:
- `monthly`: Current month's count, reset on the 1st of each month by cron
- `daily`: Current day's count, reset every day by cron
- `total`: All-time count, never resets
- `last`: Object with `id`, `timestamp`, `timestampUNIX` of the last usage event

## Limits & Daily Caps

Limits are always specified as **monthly** values in product config (e.g., `limits.requests = 100` means 100/month).

By default, limits are enforced with **daily caps** to prevent users from burning their entire monthly quota in a single day. Two checks are applied:

1. **Flat daily cap**: `ceil(monthlyLimit / daysInMonth)` — max uses per day
   - e.g., 100/month in a 31-day month = `ceil(100/31)` = 4/day
2. **Proportional monthly cap**: `ceil(monthlyLimit * dayOfMonth / daysInMonth)` — running total
   - Prevents accumulating too much too fast even within daily limits
   - e.g., Day 15 of a 30-day month with 100/month limit = max 50 used so far

Products can opt out of daily caps by setting `rateLimit: 'monthly'` (default is `'daily'`):

```json
{
  "id": "basic",
  "limits": { "requests": 100 },
  "rateLimit": "monthly"
}
```

## Proxy Usage (setUser + Mirrors)

Sometimes usage must be billed to a different user than the one making the request (e.g., anonymous visitors consuming an agent owner's credits). Use `setUser()` to swap the target and `addMirror()` / `setMirrors()` to write usage to additional Firestore docs:

```js
// Switch usage target to the agent owner (fetches their user doc)
await usage.setUser(ownerUid);

// Also write usage data to the agent doc
usage.addMirror(`agents/${agentId}`);

// Now validate, increment, and update all operate on the owner's data
// update() writes to users/{ownerUid} AND agents/{agentId} in parallel
await usage.validate('credits');
usage.increment('credits');
await usage.update();
```

**Methods:**
- `setUser(uid)` — async, fetches `users/{uid}` from Firestore, replaces `self.user`, sets `useUnauthenticatedStorage = false`
- `setMirrors(paths)` — sync, overwrites the mirror array with the given paths
- `addMirror(path)` — sync, appends a single path to the mirror array

Mirrors are write-only — `update()` writes `{ usage: self.user.usage }` (merge) to each mirror path. No reads are performed on mirrors.

## Reset Schedule

| Target | Frequency | What happens |
|--------|-----------|-------------|
| Local storage | Daily | Cleared entirely |
| `usage` collection (unauthenticated) | Daily | Deleted entirely |
| User doc `usage.*.daily` (authenticated) | Daily | Reset to 0 |
| User doc `usage.*.monthly` (authenticated) | Monthly (1st) | Reset to 0 |

The daily cron (`reset-usage.js`) runs at midnight UTC. It collects all users with non-zero counters across all metrics, then performs a single write per user to reset daily (and monthly on the 1st).
