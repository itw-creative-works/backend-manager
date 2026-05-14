# Stripe Webhook Forwarding

BEM auto-starts Stripe CLI webhook forwarding when running `npx mgr serve` or `npx mgr emulator`. This forwards Stripe test webhooks to the local server so the full payment pipeline works end-to-end during development.

**Requirements:**
- `STRIPE_SECRET_KEY` set in `functions/.env`
- `BACKEND_MANAGER_KEY` set in `functions/.env`
- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed

**Standalone usage:**

```bash
npx mgr stripe
```

If any prerequisite is missing, webhook forwarding is silently skipped with an info message.

The forwarding URL is: `http://localhost:{hostingPort}/backend-manager/payments/webhook?processor=stripe&key={BACKEND_MANAGER_KEY}`
