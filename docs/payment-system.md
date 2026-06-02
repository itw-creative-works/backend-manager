# Payment System

This document covers the full payment system: pipeline architecture, subscription model + statuses, transition handlers, processor interface, product configuration, and the test processor.

## Pipeline

The payment system follows a linear pipeline: **Intent → Webhook → On-Write → Transition**.

1. **Intent** (`POST /payments/intent`): Client requests a payment session. BEM validates the product, generates an order ID (`XXXX-XXXX-XXXX`), and delegates to the processor module (e.g., Stripe creates a Checkout Session). Saves to `payments-intents/{orderId}`.

2. **Webhook** (`POST /payments/webhook?processor=X&key=Y`): Processor sends event data. BEM parses and categorizes the event (`subscription` or `one-time`), extracts the UID, and saves to `payments-webhooks/{eventId}` with `status: 'pending'`.

3. **On-Write** (Firestore trigger on `payments-webhooks/{eventId}`): Fetches the latest resource from the processor API (not stale webhook data), transforms it into a unified object, detects state transitions, dispatches handlers, tracks analytics, and writes to `users/{uid}.subscription` (subscriptions) and `payments-orders/{orderId}`.

4. **Transitions** (fire-and-forget): Handler files run asynchronously after detection. Failures never block webhook processing. Skipped during tests unless `TEST_EXTENDED_MODE` is set.

## 3-Layer Architecture

The payment system is cleanly separated into three independent layers:

| Layer | Purpose | Tests |
|-------|---------|-------|
| **Processor input** (Stripe, PayPal, Test) | Parse raw webhooks + transform to unified shape | Helper tests per processor (`payment/stripe/to-unified-subscription.js`, `payment/paypal/to-unified-one-time.js`, etc.) |
| **Unified pipeline** (processor-agnostic) | Transition detection, Firestore writes, analytics | Journey tests (`journey-payments-*.js`) |
| **Transition handlers** (fire-and-forget) | Emails, notifications, side effects | Skipped during tests unless `TEST_EXTENDED_MODE` |

Each processor transforms its raw data into the **same unified shape**. Once data enters the pipeline, the code doesn't know or care which processor it came from. This means:
- Adding a new processor = implement the processor interface (below). The pipeline handles the rest.
- Journey tests use the `test` processor but exercise the full unified pipeline end-to-end.
- Processor-specific tests only need to verify correct transformation to the unified shape.

## Subscription Statuses

| Status | Meaning | User can delete account? |
|--------|---------|--------------------------|
| `active` | Subscription is current and valid (includes trialing) | No (unless `product.id === 'basic'`) |
| `suspended` | Payment failed (Stripe: `past_due`, `unpaid`) | No |
| `cancelled` | Subscription terminated (Stripe: `canceled`, `incomplete`, `incomplete_expired`) | Yes |

### Stripe Status Mapping

| Stripe Status | `subscription.status` | Notes |
|---|---|---|
| `active` | `active` | Normal active subscription |
| `trialing` | `active` | `trial.claimed = true` |
| `past_due` | `suspended` | Payment failed, retrying |
| `unpaid` | `suspended` | Payment failed |
| `canceled` | `cancelled` | Subscription terminated |
| `incomplete` | `cancelled` | Never completed initial payment |
| `incomplete_expired` | `cancelled` | Expired before completion |
| `active` + `cancel_at_period_end` | `active` | `cancellation.pending = true` |

## Unified Subscription Object (`users/{uid}.subscription`)

```javascript
subscription: {
  product: {
    id: 'basic',                   // product ID from config ('basic', 'premium', etc.)
    name: 'Basic',                 // display name from config
  },
  status: 'active',                // 'active' | 'suspended' | 'cancelled'
  expires: { timestamp, timestampUNIX },
  trial: {
    claimed: false,                // has user EVER used a trial
    expires: { timestamp, timestampUNIX },
  },
  cancellation: {
    pending: false,                // true = cancel at period end
    date: { timestamp, timestampUNIX },
  },
  payment: {
    processor: null,               // 'stripe' | 'paypal' | etc.
    orderId: null,                 // BEM order ID (e.g., '1234-5678-9012')
    resourceId: null,              // provider subscription ID (e.g., 'sub_xxx')
    frequency: null,               // 'monthly' | 'annually' | 'weekly' | 'daily'
    price: 0,                      // resolved from config (number, e.g., 4.99)
    startDate: { timestamp, timestampUNIX },
    updatedBy: {
      event: { name: null, id: null },
      date: { timestamp, timestampUNIX },
    },
  },
}
```

## Access Check Patterns

```javascript
// Is premium (paid)?
user.subscription.status === 'active' && user.subscription.product.id !== 'basic'

// Is on trial?
user.subscription.trial.claimed && user.subscription.status === 'active'

// Has pending cancellation?
user.subscription.cancellation.pending === true

// Payment failed?
user.subscription.status === 'suspended'
```

## resolveSubscription(account)

`User.resolveSubscription(account)` is a static method on the User helper that derives calculated subscription fields from raw account data. It returns only fields that require derivation logic — raw data (product.id, status, trial, cancellation) lives on the account object directly.

```javascript
const User = require('backend-manager/src/manager/helpers/user');

const resolved = User.resolveSubscription(account);
// Returns: { plan, active, trialing, cancelling }
```

| Field | Type | Description |
|-------|------|-------------|
| `plan` | `string` | Effective plan ID the user has access to RIGHT NOW (`'basic'` if cancelled/suspended) |
| `active` | `boolean` | User has active access (active, trialing, or cancelling) |
| `trialing` | `boolean` | In an active trial (status `'active'` + `trial.claimed` + unexpired `trial.expires`) |
| `cancelling` | `boolean` | Cancellation pending (status `'active'` + `cancellation.pending` + NOT trialing) |

Accepts either a raw Firestore account object or a resolved `User` instance (checks both `account.subscription` and `account.properties.subscription`).

**Unified with web-manager**: The same function exists as `auth.resolveSubscription(account)` in web-manager (`modules/auth.js`) with identical logic and return shape.

**Use this instead of manual access checks** — it centralizes all the derivation logic in one place:

```javascript
// ✅ PREFERRED — use resolveSubscription
const resolved = User.resolveSubscription(user);
if (resolved.active) { /* has access */ }

// ❌ AVOID — manual checks that duplicate logic
if (user.subscription.status === 'active' && user.subscription.product.id !== 'basic') { /* ... */ }
```

## Transition Handlers

When a webhook changes a subscription or processes a one-time payment, BEM detects the state transition and dispatches to a handler file. Handlers are fire-and-forget (non-blocking) — they run after the transition is detected but before or during the Firestore writes. Handler failures never block webhook processing.

Handlers are skipped during tests unless `TEST_EXTENDED_MODE` is set.

### Transition Detection

The `transitions/index.js` module compares the **before** state (current `users/{uid}.subscription`) with the **after** state (new unified subscription) to detect what changed.

### Subscription Transitions

| Transition | Before → After | File |
|---|---|---|
| `new-subscription` | basic/null → active paid | `transitions/subscription/new-subscription.js` |
| `payment-failed` | active → suspended | `transitions/subscription/payment-failed.js` |
| `payment-recovered` | suspended → active | `transitions/subscription/payment-recovered.js` |
| `cancellation-requested` | pending=false → pending=true | `transitions/subscription/cancellation-requested.js` |
| `subscription-cancelled` | non-cancelled → cancelled | `transitions/subscription/subscription-cancelled.js` |
| `plan-changed` | active product A → active product B | `transitions/subscription/plan-changed.js` |

Note: Trials are NOT a separate transition. The `new-subscription` handler checks `after.trial.claimed` to determine if the subscription started with a trial.

### One-Time Transitions

| Transition | Event Type | File |
|---|---|---|
| `purchase-completed` | `checkout.session.completed` | `transitions/one-time/purchase-completed.js` |
| `purchase-failed` | `invoice.payment_failed` | `transitions/one-time/purchase-failed.js` |

### Handler Interface

All handlers are in `src/manager/events/firestore/payments-webhooks/transitions/` and export a single async function:

```javascript
module.exports = async function ({ before, after, uid, userDoc, admin, assistant, Manager, eventType, eventId }) {
  // before: previous subscription state (null for new/one-time)
  // after: new unified state (subscription or one-time)
  // userDoc: full user document data
  // eventType: original webhook event type (e.g., 'customer.subscription.updated')
  // eventId: webhook event ID
};
```

### Creating a New Transition Handler

1. Add detection logic in `transitions/index.js` (in priority order)
2. Create handler file in `transitions/{category}/{name}.js`
3. Handler receives full context — use `assistant.log()` for logging, `Manager.getApiUrl()` for API calls

## Processor Interface

Each processor implements three modules:

**Intent processor** (`routes/payments/intent/processors/{processor}.js`):

```javascript
module.exports = {
  async createIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, Manager, assistant }) {
    return { id, url, raw };
  },
};
```

**Webhook processor** (`routes/payments/webhook/processors/{processor}.js`):

```javascript
module.exports = {
  isSupported(eventType) { return boolean; },
  parseWebhook(req) { return { eventId, eventType, category, resourceType, resourceId, raw, uid }; },
};
```

**Cancel processor** (`routes/payments/cancel/processors/{processor}.js`):

```javascript
module.exports = {
  async cancelAtPeriodEnd({ resourceId, uid, subscription, assistant }) { /* cancel at end of period */ },
};
```

**Refund processor** (`routes/payments/refund/processors/{processor}.js`):

```javascript
module.exports = {
  async processRefund({ resourceId, uid, subscription, assistant }) {
    return { amount, currency, full };
  },
};
```

**Portal processor** (`routes/payments/portal/processors/{processor}.js`):

```javascript
module.exports = {
  async createPortalSession({ resourceId, uid, returnUrl, assistant }) {
    return { url };
  },
};
```

**Shared library** (`libraries/payment/processors/{processor}.js`):

```javascript
module.exports = {
  init() { /* return SDK instance */ },
  async fetchResource(resourceType, resourceId, rawFallback, context) { /* return resource */ },
  getOrderId(resource) { /* return orderId string or null */ },
  toUnifiedSubscription(rawSubscription, options) { /* return unified object */ },
  toUnifiedOneTime(rawResource, options) { /* return unified object */ },
};
```

## Product Resolution

Products are resolved differently per processor, but always end up matching a product in `config.payment.products`:

| Processor | Resolution chain | Stable ID |
|-----------|-----------------|-----------|
| **Stripe** | `sub.items.data[0].price.product` or `raw.plan.product` → match `product.stripe.productId` or `legacyProductIds` | `prod_xxx` |
| **PayPal** | `sub → plan_id → plan → product_id` → match `product.paypal.productId` | PayPal catalog product ID |
| **Test** | Uses `product.stripe.productId` in Stripe-shaped data | Same as Stripe |

Falls back to `{ id: 'basic' }` if no match found.

## Processor-Specific Details

**Stripe:** Uses `metadata.uid` and `metadata.orderId` on subscriptions for UID/order resolution.

**PayPal:** Uses `custom_id` field on subscriptions with format `uid:{uid},orderId:{orderId}`. Product resolution fetches the plan from the subscription, then gets `product_id` from the plan. Plans are scoped by `product_id` query param to avoid cross-brand matches on shared PayPal accounts.

## Product Configuration

Products are defined in `backend-manager-config.json` under `payment.products`:

```javascript
payment: {
  processors: {
    stripe: { publishableKey: 'pk_live_...' },
    paypal: { clientId: 'ARvf...' },
  },
  products: [
    {
      id: 'basic',           // Free tier (no prices, no processor keys)
      name: 'Basic',
      type: 'subscription',
      limits: { requests: 100 },
    },
    {
      id: 'premium',         // Paid subscription
      name: 'Premium',
      type: 'subscription',
      limits: { requests: 1000 },
      trial: { days: 14 },
      prices: { monthly: 4.99, annually: 49.99 },       // Flat numbers; also supports 'weekly' and 'daily'
      stripe: { productId: 'prod_xxx', legacyProductIds: ['prod_OLD'] },
      paypal: { productId: 'PROD-abc123' },
    },
    {
      id: 'credits-100',     // One-time purchase
      name: '100 Credits',
      type: 'one-time',
      prices: { once: 9.99 },
      stripe: { productId: 'prod_yyy' },
      paypal: { productId: null },
    },
  ],
}
```

Key rules:
- `prices` contains **flat numbers only** — no processor-specific IDs
- Processor IDs live at the product level: `stripe: { productId }`, `paypal: { productId }`
- `stripe.productId` is stable — never changes even when prices change
- `stripe.legacyProductIds` maps old pre-migration Stripe products to this product
- Price IDs (Stripe `price_xxx`, PayPal plan IDs) are **resolved at runtime** by matching amount + interval against active prices on the processor's product
- `basic` product has no `prices` and no processor keys — it's the free tier
- `archived: true` stops offering a product to new subscribers while keeping it resolvable for existing ones

## Firestore Collections

| Collection | Key | Purpose |
|---|---|---|
| `payments-intents/{orderId}` | Order ID | Intent metadata (processor, product, status) |
| `payments-webhooks/{eventId}` | Processor event ID | Webhook processing state + transition result |
| `payments-orders/{orderId}` | Order ID | Unified order data (single source of truth for orders) |
| `users/{uid}.subscription` | User UID | Current subscription state (subscriptions only) |

## Test Processor

The `test` processor generates Stripe-shaped data and auto-fires webhooks to the local server. Only available in non-production environments. Use `processor: 'test'` in intent requests during testing. The test webhook processor delegates to Stripe's parser since it generates Stripe-shaped payloads.
