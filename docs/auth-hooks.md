# Auth Hooks (Consumer Project)

Auth hooks let consumer projects inject custom logic into BEM's auth event lifecycle. BEM runs its core handler first, then looks for a matching hook at `hooks/auth/{event-name}.js`.

| Hook | File | Behavior |
|------|------|----------|
| `before-create` | `hooks/auth/before-create.js` | Runs after BEM's disposable email + rate limit checks. **Can throw `HttpsError` to block signup.** |
| `before-signin` | `hooks/auth/before-signin.js` | Runs after BEM's activity update. **Can throw `HttpsError` to block sign-in.** |
| `on-create` | `hooks/auth/on-create.js` | Runs after BEM creates the user doc. **Non-blocking** — errors are caught and logged. |
| `on-delete` | `hooks/auth/on-delete.js` | Runs after BEM deletes the user doc. **Non-blocking** — errors are caught and logged. |

Hook signature (same as BEM's internal handlers):

```javascript
module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  // user: AuthUserRecord (uid, email, providerData, etc.)
  // context: AuthEventContext for blocking functions (ipAddress, userAgent, additionalUserInfo)
  //          EventContext for triggers (eventId, eventType, timestamp — no IP/userAgent)
  // libraries: { admin, functions, ... }
};
```

## Blocking hook example (before-create)

```javascript
// hooks/auth/before-create.js — Only allow Google OAuth signups
const ENFORCE = true;

const ALLOWED_PROVIDERS = ['google.com'];

module.exports = async ({ assistant, user, context, libraries }) => {
  if (!ENFORCE) { return; }

  const { functions } = libraries;
  const provider = context.additionalUserInfo?.providerId;

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    assistant.error(`hook/before-create: Blocked provider '${provider}' for ${user.email}`);
    throw new functions.auth.HttpsError('permission-denied', 'Please sign up with Google.');
  }
};
```

## Non-blocking hook example (on-create)

```javascript
// hooks/auth/on-create.js — Auto-delete spam referrals
const powertools = require('node-powertools');

const ENFORCE = true;
const BLOCKED_AFFILIATE_CODES = ['iLvQjmvm'];

module.exports = async ({ Manager, assistant, user, context, libraries }) => {
  if (!ENFORCE) { return; }

  const { admin } = libraries;
  const uid = user.uid;

  // Poll until signup route attaches attribution.affiliate.code
  let referredBy = null;

  await powertools.poll(async () => {
    const userDoc = await admin.firestore().doc(`users/${uid}`).get().catch(() => null);
    if (!userDoc?.exists) { return true; }
    referredBy = userDoc.data()?.attribution?.affiliate?.code;
    return !!referredBy;
  }, { interval: 10000, timeout: 60000 }).catch(() => {});

  if (!referredBy || !BLOCKED_AFFILIATE_CODES.includes(referredBy)) { return; }

  // Delete spam account (triggers on-delete for cleanup)
  await admin.auth().deleteUser(uid).catch(e => assistant.error('Delete failed:', e));
};
```
