/**
 * Test: marketing/webhook/forward route — unit-style coverage
 *
 * Why this exists as a unit test (not an emulator test):
 *
 * The forwarder is gated on Manager.isParent() (config.parent === 'self'). In real test runs
 * we run AGAINST a child brand's BEM (Somiibo, etc.), so the route is invisible
 * (404). To verify the fan-out logic, we exercise the route handler directly
 * against a mocked admin SDK + mocked fetch, no HTTP needed.
 *
 * What's covered:
 *   - Gate: returns 404 if Manager.isParent() returns false (config.parent !== 'self')
 *   - Auth: returns 401 if key missing/wrong
 *   - Provider validation: returns 400 if missing
 *   - Brand iteration: reads brands collection, derives API URLs
 *   - URL derivation: brand.url 'https://somiibo.com' → 'https://api.somiibo.com/backend-manager/marketing/webhook?provider=X&key=Y'
 *   - Body forwarding: raw body POSTed to every child unchanged
 *   - Failure isolation: one failed child doesn't break the others
 *   - Brands without brand.url skipped silently
 */

// Mock wonderful-fetch before requiring the route — the route does
// `require('wonderful-fetch')` at module load time.
const originalFetchPath = require.resolve('wonderful-fetch');
const fetchCalls = [];
let fetchMockBehavior = () => ({ received: true });

// Intercept require cache so our mock takes the place of wonderful-fetch
require.cache[originalFetchPath] = {
  id: originalFetchPath,
  filename: originalFetchPath,
  loaded: true,
  exports: async (url, opts) => {
    fetchCalls.push({ url, opts });
    return fetchMockBehavior(url, opts);
  },
};

const route = require('../../src/manager/routes/marketing/webhook/forward/post.js');

// --- Test scaffolding ---

function makeFirestoreMock(brandDocs) {
  return {
    collection: (name) => {
      if (name !== 'brands') {
        throw new Error(`Unexpected collection: ${name}`);
      }
      return {
        get: async () => ({
          forEach: (cb) => {
            for (const { id, data } of brandDocs) {
              cb({ id, data: () => data });
            }
          },
        }),
      };
    },
  };
}

function makeAdminMock(brandDocs) {
  const fs = makeFirestoreMock(brandDocs);
  return { firestore: () => fs };
}

function makeAssistant({ query, body }) {
  const responses = [];
  return {
    request: { query: query || {} },
    ref: { req: { body: body !== undefined ? body : [] } },
    log: () => {},
    error: () => {},
    respond: (data, opts) => {
      responses.push({ data, code: opts?.code || 200 });
      return { data, code: opts?.code || 200 };
    },
    _responses: responses,
  };
}

function makeManager(configOverrides) {
  const config = {
    parent: 'self',
    ...configOverrides,
  };
  return {
    config,
    libraries: {}, // Not used in this route — admin comes in via libraries arg
    isParent: () => config.parent === 'self',
  };
}

function resetFetchMock() {
  fetchCalls.length = 0;
  fetchMockBehavior = () => ({ received: true });
}

// Saves and restores process.env so tests don't leak side effects
function withEnv(envOverrides, fn) {
  const saved = {};
  for (const k of Object.keys(envOverrides)) {
    saved[k] = process.env[k];
    process.env[k] = envOverrides[k];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(envOverrides)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

module.exports = {
  description: 'webhook/forward unit tests (mocked admin + fetch)',
  type: 'group',
  tests: [
    // ─── Gating ───

    {
      name: 'returns-404-when-parent-not-self',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' } });
          const Manager = makeManager({ parent: 'https://api.itwcreativeworks.com' }); // NOT 'self'
          const admin = makeAdminMock([]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(assistant._responses.length, 1, 'should respond once');
          assert.equal(assistant._responses[0].code, 404, 'should return 404');
          assert.equal(fetchCalls.length, 0, 'should NOT call fetch when gated');
        });
      },
    },

    {
      name: 'allows-route-when-parent-is-self',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' } });
          const Manager = makeManager({ parent: 'self' });
          const admin = makeAdminMock([]); // No brands — but route still reaches the fan-out step

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(assistant._responses[0].code, 200, 'should return 200 when parent: self');
          assert.equal(assistant._responses[0].data.forwarded, 0, 'no brands means 0 forwarded');
        });
      },
    },

    // ─── Auth ───

    {
      name: 'rejects-missing-provider',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { key: 'test-key' } }); // no provider
          const Manager = makeManager();
          const admin = makeAdminMock([]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(assistant._responses[0].code, 400, 'missing provider → 400');
        });
      },
    },

    {
      name: 'rejects-missing-key',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid' } }); // no key
          const Manager = makeManager();
          const admin = makeAdminMock([]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(assistant._responses[0].code, 401, 'missing key → 401');
        });
      },
    },

    {
      name: 'rejects-wrong-key',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'real-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'wrong-key' } });
          const Manager = makeManager();
          const admin = makeAdminMock([]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(assistant._responses[0].code, 401, 'wrong key → 401');
        });
      },
    },

    // ─── Fan-out logic ───

    {
      name: 'derives-api-url-from-brand-url-and-fans-out',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const body = [{ sg_event_id: 'evt1', event: 'group_unsubscribe', email: 't@example.com' }];
          const assistant = makeAssistant({
            query: { provider: 'sendgrid', key: 'test-key' },
            body,
          });
          const Manager = makeManager();
          const admin = makeAdminMock([
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
            { id: 'chatsy', data: { brand: { id: 'chatsy', url: 'https://chatsy.com' } } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 2, 'should fan out to both brands');
          assert.equal(
            fetchCalls[0].url,
            'https://api.somiibo.com/backend-manager/marketing/webhook?provider=sendgrid&key=test-key',
            'first child URL derived correctly'
          );
          assert.equal(
            fetchCalls[1].url,
            'https://api.chatsy.com/backend-manager/marketing/webhook?provider=sendgrid&key=test-key',
            'second child URL derived correctly'
          );
          assert.deepEqual(fetchCalls[0].opts.body, body, 'raw body forwarded unchanged');
          assert.equal(assistant._responses[0].data.succeeded, 2, '2 children succeeded');
        });
      },
    },

    {
      name: 'forwards-raw-body-unchanged-for-beehiiv',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const body = {
            id: 'beehiiv-evt1',
            event: 'subscription.unsubscribed',
            email: 'x@example.com',
            publication_id: 'pub_abc',
          };
          const assistant = makeAssistant({
            query: { provider: 'beehiiv', key: 'test-key' },
            body,
          });
          const Manager = makeManager();
          const admin = makeAdminMock([
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 1);
          assert.ok(fetchCalls[0].url.includes('provider=beehiiv'), 'provider param preserved');
          assert.deepEqual(fetchCalls[0].opts.body, body, 'raw Beehiiv body forwarded unchanged');
        });
      },
    },

    {
      name: 'skips-brands-without-brand-url',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' }, body: [] });
          const Manager = makeManager();
          const admin = makeAdminMock([
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
            { id: 'partial-brand', data: { brand: { id: 'partial-brand' /* no url */ } } },
            { id: 'no-brand-key', data: { /* no brand at all */ } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 1, 'only the brand with a URL should be fanned to');
          assert.ok(fetchCalls[0].url.includes('api.somiibo.com'), 'somiibo was the one called');
        });
      },
    },

    {
      name: 'failure-isolation-one-bad-child-does-not-break-others',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          fetchMockBehavior = (url) => {
            if (url.includes('chatsy.com')) {
              throw new Error('connection refused');
            }
            return { received: true };
          };

          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' }, body: [] });
          const Manager = makeManager();
          const admin = makeAdminMock([
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
            { id: 'chatsy', data: { brand: { id: 'chatsy', url: 'https://chatsy.com' } } },
            { id: 'dashqr', data: { brand: { id: 'dashqr', url: 'https://dashqr.com' } } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 3, 'all 3 children attempted');
          const response = assistant._responses[0];
          assert.equal(response.code, 200, 'response is still 200 — provider should not retry parent');
          assert.equal(response.data.succeeded, 2, '2 children succeeded');
          assert.equal(response.data.failed, 1, '1 child failed');
          assert.ok(response.data.failures, 'failures array populated');
          assert.equal(response.data.failures[0].brandId, 'chatsy', 'failure entry names the brand');
        });
      },
    },

    {
      name: 'invalid-brand-url-counted-as-failure-not-thrown',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' }, body: [] });
          const Manager = makeManager();
          const admin = makeAdminMock([
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
            { id: 'broken', data: { brand: { id: 'broken', url: 'not-a-valid-url' } } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          const response = assistant._responses[0];
          assert.equal(response.code, 200, 'route still returns 200');
          assert.equal(response.data.succeeded, 1, 'somiibo succeeded');
          assert.equal(response.data.failed, 1, 'broken brand counted as failed');
          assert.equal(fetchCalls.length, 1, 'only the valid URL was actually fetched');
        });
      },
    },

    {
      name: 'self-is-included-in-fanout',
      async run({ assert }) {
        // The parent's own brand IS expected to be in the brands collection.
        // It should be fanned to via HTTP like any other brand, so its own
        // BEM processes its own user updates the same way as siblings.
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' }, body: [] });
          const Manager = makeManager({ brand: { id: 'itw-creative-works' } });
          const admin = makeAdminMock([
            { id: 'itw-creative-works', data: { brand: { id: 'itw-creative-works', url: 'https://itwcreativeworks.com' } } },
            { id: 'somiibo', data: { brand: { id: 'somiibo', url: 'https://somiibo.com' } } },
          ]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 2, 'parent fans out to ALL brands including itself');
          assert.ok(
            fetchCalls.some(c => c.url.includes('api.itwcreativeworks.com')),
            'self IS in the fan-out target list'
          );
        });
      },
    },

    {
      name: 'zero-brands-handled-gracefully',
      async run({ assert }) {
        await withEnv({ BACKEND_MANAGER_WEBHOOK_KEY: 'test-key' }, async () => {
          resetFetchMock();
          const assistant = makeAssistant({ query: { provider: 'sendgrid', key: 'test-key' }, body: [] });
          const Manager = makeManager();
          const admin = makeAdminMock([]);

          await route({ assistant, Manager, libraries: { admin } });

          assert.equal(fetchCalls.length, 0);
          assert.equal(assistant._responses[0].code, 200, 'still 200 with no brands');
          assert.equal(assistant._responses[0].data.forwarded, 0);
        });
      },
    },
  ],
};
