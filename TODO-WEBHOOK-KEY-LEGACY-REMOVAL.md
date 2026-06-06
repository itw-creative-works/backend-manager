# TODO: Remove legacy BACKEND_MANAGER_KEY acceptance from webhook routes

When v5.2.x shipped, the two payment-webhook routes were switched to prefer `BACKEND_MANAGER_WEBHOOK_KEY` but still accept `BACKEND_MANAGER_KEY` as a transitional fallback so existing provider URLs (registered with the old key) keep working until OMEGA re-registers them with the new key.

Once every brand's provider URLs (Stripe / PayPal / Chargebee / Chargeblast / Coinbase / etc.) have been re-registered via OMEGA to use `BACKEND_MANAGER_WEBHOOK_KEY`, drop the legacy fallback:

## Files to update

- `src/manager/routes/payments/webhook/post.js` — line ~28: remove the `|| key === process.env.BACKEND_MANAGER_KEY` half of the validation check.
- `src/manager/routes/payments/dispute-alert/post.js` — line ~20: same removal. Also update the docstring at line ~11 to drop the "BACKEND_MANAGER_KEY accepted as legacy fallback" note.
- `docs/stripe-webhook-forwarding.md` — drop the "BACKEND_MANAGER_KEY also accepted as a legacy fallback" parenthetical.

## How to verify it's safe

Grep production logs (`npx mgr logs:read --fn bm_api --grep "payments/webhook" --limit 1000`) and confirm zero `401 Invalid key` hits over a meaningful window. If there are any, those are providers still on the old URL — re-register them via OMEGA before dropping the fallback.
