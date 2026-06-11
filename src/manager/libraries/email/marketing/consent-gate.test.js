/**
 * Consent gate test — verifies Marketing.add()/sync() skip users whose
 * consent.marketing.status is the literal string 'revoked' (and ONLY then).
 *
 * Plain-node control-flow test (no emulator, no providers, no network):
 * - isMarketingRevoked() — the pure gate semantic (revoked-only skip).
 * - sync() — gate fires after doc resolution, BEFORE validation/providers, so a
 *   revoked doc returns { blocked: 'consent', email } with zero I/O. Proceed cases
 *   stop at the testing-mode provider guard (assistant.isTesting() → true here).
 * - add() — by-email lookup runs through a minimal in-memory firestore stand-in to
 *   exercise add()'s wiring (block on revoked, proceed on no-user, fail open on
 *   lookup error). The emulator suites (test/routes/marketing/*) remain the
 *   integration surface for the real Firestore paths.
 *
 * Run:   node src/manager/libraries/email/marketing/consent-gate.test.js
 */
const Marketing = require('./index.js');

const { isMarketingRevoked } = Marketing;

// Proceed cases must stop at the testing-mode provider guard — never let an ambient
// TEST_EXTENDED_MODE (or provider API keys) in the shell turn this into a live call.
delete process.env.TEST_EXTENDED_MODE;

// ─── isMarketingRevoked(): ONLY the literal 'revoked' blocks ───
const GATE_CASES = [
  { name: 'status revoked', doc: { consent: { marketing: { status: 'revoked' } } }, expect: true },
  { name: 'status granted', doc: { consent: { marketing: { status: 'granted' } } }, expect: false },
  { name: 'status null', doc: { consent: { marketing: { status: null } } }, expect: false },
  { name: 'status missing', doc: { consent: { marketing: {} } }, expect: false },
  { name: 'marketing missing', doc: { consent: {} }, expect: false },
  { name: 'consent missing (legacy user)', doc: { auth: { email: 'legacy@gmail.com' } }, expect: false },
  { name: 'empty doc', doc: {}, expect: false },
  { name: 'null doc (no user)', doc: null, expect: false },
  { name: 'undefined doc', doc: undefined, expect: false },
  { name: 'status REVOKED (case-sensitive literal)', doc: { consent: { marketing: { status: 'REVOKED' } } }, expect: false },
  { name: 'status pending (future enum value)', doc: { consent: { marketing: { status: 'pending' } } }, expect: false },
  { name: 'status true (non-string)', doc: { consent: { marketing: { status: true } } }, expect: false },
];

/**
 * Minimal assistant — just what the Marketing constructor + gate paths read.
 * isTesting() → true so proceed cases stop at the provider guard (no network).
 */
function buildAssistant(admin) {
  const calls = { logs: [], warns: [], errors: [] };

  const assistant = {
    Manager: {
      libraries: { admin },
      config: {},
    },
    isTesting: () => true,
    log: (...args) => calls.logs.push(args),
    warn: (...args) => calls.warns.push(args),
    error: (...args) => calls.errors.push(args),
  };

  return { assistant, calls };
}

/**
 * Minimal in-memory firestore stand-in for add()'s by-email lookup and sync()'s
 * by-uid fetch. `userDoc: null` → empty query result / nonexistent doc.
 * `failLookup: true` → the query get() rejects (exercises the fail-open path).
 */
function buildAdmin({ userDoc = null, failLookup = false } = {}) {
  const captured = { queries: [], docPaths: [] };

  const admin = {
    firestore: () => ({
      collection: (name) => ({
        where: (field, op, value) => {
          captured.queries.push({ collection: name, field, op, value });
          return {
            limit: () => ({
              get: async () => {
                if (failLookup) {
                  throw new Error('firestore unavailable');
                }
                return userDoc
                  ? { empty: false, docs: [{ id: 'test-uid', data: () => userDoc }] }
                  : { empty: true, docs: [] };
              },
            }),
          };
        },
      }),
      doc: (path) => {
        captured.docPaths.push(path);
        return {
          get: async () => ({
            exists: !!userDoc,
            data: () => userDoc,
          }),
        };
      },
    }),
  };

  return { admin, captured };
}

const REVOKED_DOC = {
  auth: { email: 'revoked.user@gmail.com' },
  consent: { marketing: { status: 'revoked' } },
};

const GRANTED_DOC = {
  auth: { email: 'granted.user@gmail.com' },
  consent: { marketing: { status: 'granted' } },
};

const LEGACY_DOC = {
  auth: { email: 'legacy.user@gmail.com' },
  // No consent field at all — pre-consent-system user, must keep syncing
};

async function run() {
  let passed = 0;
  let failed = 0;

  function check(ok, name, detail) {
    if (ok) {
      passed++;
      return;
    }

    failed++;
    console.log(`  ✗ ${name}`);
    if (detail) {
      console.log(`    ${detail}`);
    }
  }

  // ─── 1. isMarketingRevoked() semantics ───
  for (const { name, doc, expect } of GATE_CASES) {
    const actual = isMarketingRevoked(doc);
    check(actual === expect, `isMarketingRevoked: ${name}`, `Expected ${expect}, got ${actual}`);
  }

  // ─── 2. sync() blocks a revoked doc (gate fires before validation/providers) ───
  {
    const { assistant, calls } = buildAssistant(null);
    const result = await new Marketing(assistant).sync(REVOKED_DOC);

    check(result.blocked === 'consent', 'sync(): blocks revoked doc', `Expected blocked='consent', got ${JSON.stringify(result)}`);
    check(result.email === 'revoked.user@gmail.com', 'sync(): blocked result includes email', `Got ${JSON.stringify(result)}`);
    check(calls.warns.length === 1, 'sync(): revoked skip logs a warn', `Got ${calls.warns.length} warns`);
  }

  // ─── 3. sync() proceeds on missing consent (legacy user) ───
  {
    const { assistant } = buildAssistant(null);
    const result = await new Marketing(assistant).sync(LEGACY_DOC);

    check(result.blocked === undefined, 'sync(): proceeds on missing consent', `Expected no block, got ${JSON.stringify(result)}`);
  }

  // ─── 4. sync() proceeds on granted consent ───
  {
    const { assistant } = buildAssistant(null);
    const result = await new Marketing(assistant).sync(GRANTED_DOC);

    check(result.blocked === undefined, 'sync(): proceeds on granted consent', `Expected no block, got ${JSON.stringify(result)}`);
  }

  // ─── 5. sync() by uid blocks when the fetched doc is revoked ───
  {
    const { admin, captured } = buildAdmin({ userDoc: REVOKED_DOC });
    const { assistant } = buildAssistant(admin);
    const result = await new Marketing(assistant).sync('revoked-uid');

    check(result.blocked === 'consent', 'sync(uid): blocks revoked fetched doc', `Expected blocked='consent', got ${JSON.stringify(result)}`);
    check(captured.docPaths[0] === 'users/revoked-uid', 'sync(uid): fetches users/{uid}', `Got ${JSON.stringify(captured.docPaths)}`);
  }

  // ─── 6. add() blocks when the email maps to a revoked user ───
  {
    const { admin, captured } = buildAdmin({ userDoc: REVOKED_DOC });
    const { assistant, calls } = buildAssistant(admin);
    const result = await new Marketing(assistant).add({ email: 'revoked.user@gmail.com' });

    check(result.blocked === 'consent', 'add(): blocks revoked user by email', `Expected blocked='consent', got ${JSON.stringify(result)}`);
    check(result.email === 'revoked.user@gmail.com', 'add(): blocked result includes email', `Got ${JSON.stringify(result)}`);
    check(calls.warns.length === 1, 'add(): revoked skip logs a warn', `Got ${calls.warns.length} warns`);

    const query = captured.queries[0];
    check(
      query
        && query.collection === 'users'
        && query.field === 'auth.email'
        && query.op === '=='
        && query.value === 'revoked.user@gmail.com',
      'add(): looks up users by auth.email (webhook-processor query)',
      `Got ${JSON.stringify(query)}`
    );
  }

  // ─── 7. add() normalizes the email for the lookup ───
  {
    const { admin, captured } = buildAdmin({ userDoc: null });
    const { assistant } = buildAssistant(admin);
    await new Marketing(assistant).add({ email: '  Revoked.User@GMAIL.com  ' });

    check(
      captured.queries[0]?.value === 'revoked.user@gmail.com',
      'add(): lookup trims + lowercases the email',
      `Got ${JSON.stringify(captured.queries[0])}`
    );
  }

  // ─── 8. add() proceeds when no user doc exists (pure newsletter contact) ───
  {
    const { admin } = buildAdmin({ userDoc: null });
    const { assistant } = buildAssistant(admin);
    const result = await new Marketing(assistant).add({ email: 'newsletter.reader@gmail.com' });

    check(result.blocked === undefined, 'add(): proceeds when no user doc exists', `Expected no block, got ${JSON.stringify(result)}`);
  }

  // ─── 9. add() proceeds when the matched user has no consent field (legacy) ───
  {
    const { admin } = buildAdmin({ userDoc: LEGACY_DOC });
    const { assistant } = buildAssistant(admin);
    const result = await new Marketing(assistant).add({ email: 'legacy.user@gmail.com' });

    check(result.blocked === undefined, 'add(): proceeds on legacy user (no consent field)', `Expected no block, got ${JSON.stringify(result)}`);
  }

  // ─── 10. add() fails open when the lookup errors ───
  {
    const { admin } = buildAdmin({ failLookup: true });
    const { assistant, calls } = buildAssistant(admin);
    const result = await new Marketing(assistant).add({ email: 'someone@gmail.com' });

    check(result.blocked === undefined, 'add(): fails open on lookup error', `Expected no block, got ${JSON.stringify(result)}`);
    check(calls.errors.length === 1, 'add(): lookup error is logged', `Got ${calls.errors.length} errors`);
  }

  console.log('');
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
