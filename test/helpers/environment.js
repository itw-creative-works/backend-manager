/**
 * Test: environment detection + URL helpers
 * Covers the Manager's getEnvironment() SSOT, the derived is*() checks, the URL
 * builders (getApiUrl / getFunctionsUrl / getWebsiteUrl + parent variants), and the
 * assistant→Manager forwarding.
 *
 * Run: npx mgr test bem:helpers/environment
 *
 * Contract (see docs/environment-detection.md):
 *   - getEnvironment() is the SINGLE SOURCE OF TRUTH — the only reader of the raw env
 *     vars (BEM_TESTING / ENVIRONMENT / FUNCTIONS_EMULATOR / TERM_PROGRAM). Returns
 *     exactly ONE of 'development' | 'testing' | 'production' (testing wins).
 *   - isDevelopment()/isProduction()/isTesting() DERIVE from getEnvironment() — they
 *     never read raw signals, so they can NEVER disagree with it. Exactly one is true.
 *   - getApiUrl/getFunctionsUrl/getWebsiteUrl resolve LOCAL in dev OR testing, prod
 *     otherwise. The parent helpers ALWAYS return the live URL (no localhost).
 *   - The assistant forwards each method to its Manager (identical results).
 */

// Run a thunk with the env-detection vars cleared, restoring them afterward. These are
// the only inputs getEnvironment() reads, so clearing them gives a clean slate per case.
function withEnv(overrides, fn) {
  const KEYS = ['BEM_TESTING', 'ENVIRONMENT', 'FUNCTIONS_EMULATOR', 'TERM_PROGRAM'];
  const saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  try {
    for (const k of KEYS) delete process.env[k];
    for (const k of Object.keys(overrides)) process.env[k] = overrides[k];
    return fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

module.exports = {
  description: 'Environment detection + URL helpers',
  type: 'group',

  tests: [
    // ─── getEnvironment() resolution + precedence ───

    {
      name: 'getEnvironment: testing wins over everything (BEM_TESTING=true)',
      async run({ Manager, assert }) {
        withEnv({ BEM_TESTING: 'true', ENVIRONMENT: 'production' }, () => {
          assert.equal(Manager.getEnvironment(), 'testing');
        });
      },
    },
    {
      name: 'getEnvironment: production when ENVIRONMENT=production (not testing)',
      async run({ Manager, assert }) {
        withEnv({ ENVIRONMENT: 'production' }, () => {
          assert.equal(Manager.getEnvironment(), 'production');
        });
      },
    },
    {
      name: 'getEnvironment: development when ENVIRONMENT=development',
      async run({ Manager, assert }) {
        withEnv({ ENVIRONMENT: 'development' }, () => {
          assert.equal(Manager.getEnvironment(), 'development');
        });
      },
    },
    {
      name: 'getEnvironment: development when FUNCTIONS_EMULATOR is set',
      async run({ Manager, assert }) {
        withEnv({ FUNCTIONS_EMULATOR: 'true' }, () => {
          assert.equal(Manager.getEnvironment(), 'development');
        });
      },
    },
    {
      name: 'getEnvironment: defaults to production with no signal (deployed function)',
      async run({ Manager, assert }) {
        withEnv({}, () => {
          assert.equal(Manager.getEnvironment(), 'production');
        });
      },
    },

    // ─── The KEY invariant: is*() derive from getEnvironment() and can NEVER disagree ───

    {
      name: 'invariant: is*() exactly matches getEnvironment() across every scenario',
      async run({ Manager, assert }) {
        const scenarios = [
          { env: { BEM_TESTING: 'true', ENVIRONMENT: 'production' }, expect: 'testing' },
          { env: { ENVIRONMENT: 'production' },                     expect: 'production' },
          { env: { ENVIRONMENT: 'development' },                    expect: 'development' },
          { env: { FUNCTIONS_EMULATOR: 'true' },                    expect: 'development' },
          { env: {},                                                expect: 'production' },
        ];
        for (const s of scenarios) {
          withEnv(s.env, () => {
            const e = Manager.getEnvironment();
            assert.equal(e, s.expect, `getEnvironment for ${JSON.stringify(s.env)}`);
            // Each is*() must equal (getEnvironment() === its value) — no independent reads.
            assert.equal(Manager.isDevelopment(), e === 'development', `isDevelopment for ${e}`);
            assert.equal(Manager.isTesting(),     e === 'testing',     `isTesting for ${e}`);
            assert.equal(Manager.isProduction(),  e === 'production',  `isProduction for ${e}`);
          });
        }
      },
    },
    {
      name: 'invariant: exactly one of is*() is true in every scenario (mutually exclusive)',
      async run({ Manager, assert }) {
        const envs = [
          { BEM_TESTING: 'true' },
          { ENVIRONMENT: 'production' },
          { ENVIRONMENT: 'development' },
          { FUNCTIONS_EMULATOR: 'true' },
          {},
        ];
        for (const env of envs) {
          withEnv(env, () => {
            const trueCount = [Manager.isDevelopment(), Manager.isTesting(), Manager.isProduction()]
              .filter(Boolean).length;
            assert.equal(trueCount, 1, `exactly one true for ${JSON.stringify(env)}`);
          });
        }
      },
    },
    {
      name: 'isProduction is a real positive check (NOT just !isDevelopment) — false in testing',
      async run({ Manager, assert }) {
        withEnv({ BEM_TESTING: 'true' }, () => {
          assert.equal(Manager.isDevelopment(), false, 'isDevelopment false in testing');
          assert.equal(Manager.isProduction(),  false, 'isProduction false in testing');
          assert.equal(Manager.isTesting(),     true,  'isTesting true in testing');
        });
      },
    },

    // ─── assistant forwards to the Manager (identical results) ───

    {
      name: 'assistant forwards getEnvironment()/is*() to the Manager (identical)',
      async run({ Manager, assistant, assert }) {
        const cases = [
          { BEM_TESTING: 'true' },
          { ENVIRONMENT: 'production' },
          { ENVIRONMENT: 'development' },
        ];
        for (const env of cases) {
          withEnv(env, () => {
            assert.equal(assistant.getEnvironment(), Manager.getEnvironment(), 'getEnvironment forward');
            assert.equal(assistant.isDevelopment(), Manager.isDevelopment(), 'isDevelopment forward');
            assert.equal(assistant.isTesting(),     Manager.isTesting(),     'isTesting forward');
            assert.equal(assistant.isProduction(),  Manager.isProduction(),  'isProduction forward');
          });
        }
      },
    },

    // ─── URL helpers: local in dev/testing, production otherwise ───

    {
      name: 'getApiUrl: localhost in development AND testing, prod otherwise',
      async run({ Manager, assert }) {
        withEnv({ FUNCTIONS_EMULATOR: 'true' }, () => {
          assert.equal(Manager.getApiUrl(), 'http://localhost:5002', 'dev → localhost');
        });
        withEnv({ BEM_TESTING: 'true' }, () => {
          assert.equal(Manager.getApiUrl(), 'http://localhost:5002', 'testing → localhost');
        });
        withEnv({ ENVIRONMENT: 'production' }, () => {
          assert.match(Manager.getApiUrl(), /^https:\/\/api\./, 'prod → api.<domain>');
        });
      },
    },
    {
      name: 'getApiUrl: explicit env arg overrides current environment',
      async run({ Manager, assert }) {
        // Under the test harness we're in 'testing', but an explicit arg forces the mapping.
        assert.equal(Manager.getApiUrl('development'), 'http://localhost:5002', "arg 'development' → localhost");
        assert.match(Manager.getApiUrl('production'), /^https:\/\/api\./, "arg 'production' → prod");
      },
    },
    {
      name: 'getFunctionsUrl: localhost in development AND testing, cloudfunctions otherwise',
      async run({ Manager, assert }) {
        withEnv({ FUNCTIONS_EMULATOR: 'true' }, () => {
          assert.match(Manager.getFunctionsUrl(), /^http:\/\/localhost:5001\//, 'dev → localhost:5001');
        });
        withEnv({ BEM_TESTING: 'true' }, () => {
          assert.match(Manager.getFunctionsUrl(), /^http:\/\/localhost:5001\//, 'testing → localhost:5001');
        });
        withEnv({ ENVIRONMENT: 'production' }, () => {
          assert.match(Manager.getFunctionsUrl(), /cloudfunctions\.net$/, 'prod → cloudfunctions.net');
        });
      },
    },
    {
      name: 'getWebsiteUrl: localhost:4000 in development AND testing, brand.url otherwise',
      async run({ Manager, assert }) {
        withEnv({ FUNCTIONS_EMULATOR: 'true' }, () => {
          assert.equal(Manager.getWebsiteUrl(), 'https://localhost:4000', 'dev → localhost:4000');
        });
        withEnv({ BEM_TESTING: 'true' }, () => {
          assert.equal(Manager.getWebsiteUrl(), 'https://localhost:4000', 'testing → localhost:4000');
        });
        withEnv({ ENVIRONMENT: 'production' }, () => {
          const url = Manager.getWebsiteUrl();
          assert.equal(url.startsWith('https://localhost'), false, 'prod → NOT localhost');
        });
      },
    },

    // ─── Parent helpers ALWAYS resolve live (never localhost), even in dev/testing ───

    {
      name: 'getParentApiUrl / getParentUrl never redirect to localhost (always live)',
      async run({ Manager, assert }) {
        // Even under the test harness ('testing'), the parent is a real remote server.
        const parentUrl = Manager.getParentUrl();
        const parentApi = Manager.getParentApiUrl();
        assert.equal((parentUrl || '').includes('localhost'), false, 'getParentUrl not localhost');
        assert.equal((parentApi || '').includes('localhost'), false, 'getParentApiUrl not localhost');
        // When set, the parent API URL carries the api. subdomain.
        if (parentApi) assert.match(parentApi, /^https:\/\/api\./, 'parent api uses api. subdomain');
      },
    },
  ],
};
