/**
 * Test: helpers/user
 * Unit tests for Manager.User() schema-driven normalization
 *
 * Tests the declarative schema resolver: defaults, passthrough, templates, type coercion
 */
const User = require('../../src/manager/helpers/user.js');

// Mock Manager with minimal Utilities
const Manager = {
  Utilities: () => ({
    randomId: ({ size }) => 'test123',
  }),
};

function createUser(settings) {
  return new User(Manager, settings).properties;
}

module.exports = {
  description: 'User() schema resolver',
  type: 'group',

  tests: [
    // ─── Empty / new user ───

    {
      name: 'empty-settings-gets-all-defaults',
      async run({ assert }) {
        const user = createUser({});

        // Auth
        assert.equal(user.auth.uid, null, 'auth.uid should be null');
        assert.equal(user.auth.email, null, 'auth.email should be null');
        assert.equal(user.auth.temporary, false, 'auth.temporary should be false');

        // Subscription
        assert.equal(user.subscription.product.id, 'basic', 'subscription.product.id should be basic');
        assert.equal(user.subscription.product.name, 'Basic', 'subscription.product.name should be Basic');
        assert.equal(user.subscription.status, 'active', 'subscription.status should be active');
        assert.equal(user.subscription.trial.claimed, false, 'subscription.trial.claimed should be false');
        assert.equal(user.subscription.cancellation.pending, false, 'subscription.cancellation.pending should be false');

        // Timestamps should exist
        assert.ok(user.subscription.expires.timestamp, 'subscription.expires.timestamp should exist');
        assert.equal(typeof user.subscription.expires.timestampUNIX, 'number', 'subscription.expires.timestampUNIX should be number');

        // Roles
        assert.equal(user.roles.admin, false, 'roles.admin should be false');
        assert.equal(user.roles.betaTester, false, 'roles.betaTester should be false');
        assert.equal(user.roles.developer, false, 'roles.developer should be false');

        // Flags
        assert.equal(user.flags.signupProcessed, false, 'flags.signupProcessed should be false');

        // Affiliate
        assert.equal(typeof user.affiliate.code, 'string', 'affiliate.code should be string');
        assert.ok(user.affiliate.code.length > 0, 'affiliate.code should not be empty');
        assert.ok(Array.isArray(user.affiliate.referrals), 'affiliate.referrals should be array');

        // Activity
        assert.ok(user.activity.lastActivity.timestamp, 'activity.lastActivity.timestamp should exist');
        assert.ok(user.activity.created.timestamp, 'activity.created.timestamp should exist');
        assert.equal(user.activity.geolocation.latitude, 0, 'geolocation.latitude should be 0');
        assert.equal(user.activity.geolocation.longitude, 0, 'geolocation.longitude should be 0');
        assert.equal(user.activity.client.mobile, false, 'client.mobile should be false');

        // API keys
        assert.equal(typeof user.api.clientId, 'string', 'api.clientId should be string');
        assert.ok(user.api.clientId.length > 0, 'api.clientId should not be empty');
        assert.equal(typeof user.api.privateKey, 'string', 'api.privateKey should be string');
        assert.ok(user.api.privateKey.length > 0, 'api.privateKey should not be empty');

        // Usage
        assert.equal(user.usage.requests.period, 0, 'usage.requests.period should be 0');
        assert.equal(user.usage.requests.total, 0, 'usage.requests.total should be 0');
        assert.equal(user.usage.requests.last.id, null, 'usage.requests.last.id should be null');

        // Personal
        assert.equal(user.personal.name.first, null, 'personal.name.first should be null');
        assert.equal(user.personal.name.last, null, 'personal.name.last should be null');
        assert.equal(user.personal.telephone.countryCode, 0, 'telephone.countryCode should be 0');

        // OAuth2
        assert.deepEqual(user.oauth2, {}, 'oauth2 should be empty object');

        // Attribution
        assert.equal(user.attribution.affiliate.code, null, 'attribution.affiliate.code should be null');
        assert.deepEqual(user.attribution.utm.tags, {}, 'attribution.utm.tags should be empty object');
      },
    },

    {
      name: 'undefined-settings-gets-all-defaults',
      async run({ assert }) {
        const user = new User(Manager).properties;

        assert.equal(user.auth.uid, null, 'auth.uid should be null');
        assert.equal(user.subscription.product.id, 'basic', 'subscription.product.id should be basic');
        assert.equal(user.roles.admin, false, 'roles.admin should be false');
      },
    },

    // ─── Preserving real user data ───

    {
      name: 'real-data-takes-precedence-over-defaults',
      async run({ assert }) {
        const user = createUser({
          auth: { uid: 'user123', email: 'test@test.com', temporary: true },
          subscription: { product: { id: 'pro', name: 'Pro' }, status: 'cancelled' },
          roles: { admin: true, betaTester: true, developer: false },
          personal: { name: { first: 'Ian', last: 'W' } },
        });

        assert.equal(user.auth.uid, 'user123', 'auth.uid should be preserved');
        assert.equal(user.auth.email, 'test@test.com', 'auth.email should be preserved');
        assert.equal(user.auth.temporary, true, 'auth.temporary should be preserved');
        assert.equal(user.subscription.product.id, 'pro', 'subscription.product.id should be preserved');
        assert.equal(user.subscription.status, 'cancelled', 'subscription.status should be preserved');
        assert.equal(user.roles.admin, true, 'roles.admin should be preserved');
        assert.equal(user.personal.name.first, 'Ian', 'personal.name.first should be preserved');
      },
    },

    // ─── $passthrough: oauth2 ───

    {
      name: 'oauth2-passthrough-preserves-provider-data',
      async run({ assert }) {
        const googleToken = {
          access_token: 'ya29.xxx',
          refresh_token: '1//xxx',
          expiry_date: 1700000000,
        };
        const msToken = {
          access_token: 'eyJ.xxx',
          refresh_token: 'M.xxx',
        };

        const user = createUser({
          oauth2: {
            google: {
              token: googleToken,
              identity: { email: 'g@gmail.com', name: 'Test' },
            },
            microsoft: {
              token: msToken,
            },
          },
        });

        assert.equal(user.oauth2.google.token.access_token, 'ya29.xxx', 'google access_token preserved');
        assert.equal(user.oauth2.google.token.refresh_token, '1//xxx', 'google refresh_token preserved');
        assert.equal(user.oauth2.google.identity.email, 'g@gmail.com', 'google identity preserved');
        assert.equal(user.oauth2.microsoft.token.access_token, 'eyJ.xxx', 'microsoft token preserved');
      },
    },

    {
      name: 'oauth2-empty-when-not-provided',
      async run({ assert }) {
        const user = createUser({});
        assert.deepEqual(user.oauth2, {}, 'oauth2 should be empty object when not provided');
      },
    },

    // ─── $passthrough: roles (with defined defaults) ───

    {
      name: 'roles-passthrough-preserves-custom-roles',
      async run({ assert }) {
        const user = createUser({
          roles: { admin: true, customRole: true, moderator: false },
        });

        assert.equal(user.roles.admin, true, 'admin should be true');
        assert.equal(user.roles.customRole, true, 'customRole should be preserved');
        assert.equal(user.roles.moderator, false, 'moderator should be preserved');
        assert.equal(user.roles.betaTester, false, 'betaTester should get default');
        assert.equal(user.roles.developer, false, 'developer should get default');
      },
    },

    // ─── $passthrough: flags (with defined defaults) ───

    {
      name: 'flags-passthrough-preserves-custom-flags',
      async run({ assert }) {
        const user = createUser({
          flags: { signupProcessed: true, featureX: true, betaOptIn: false },
        });

        assert.equal(user.flags.signupProcessed, true, 'signupProcessed preserved');
        assert.equal(user.flags.featureX, true, 'featureX preserved');
        assert.equal(user.flags.betaOptIn, false, 'betaOptIn preserved');
      },
    },

    // ─── $template: usage with dynamic keys ───

    {
      name: 'usage-template-preserves-dynamic-keys',
      async run({ assert }) {
        const user = createUser({
          usage: {
            requests: { period: 10, total: 100, last: { id: 'r1', timestamp: '2025-01-01T00:00:00.000Z', timestampUNIX: 1735689600 } },
            emails: { period: 5, total: 50, last: { id: 'e1', timestamp: '2025-01-02T00:00:00.000Z', timestampUNIX: 1735776000 } },
            sends: { period: 3, total: 30 },
          },
        });

        // Defined key (requests)
        assert.equal(user.usage.requests.period, 10, 'requests.period preserved');
        assert.equal(user.usage.requests.total, 100, 'requests.total preserved');
        assert.equal(user.usage.requests.last.id, 'r1', 'requests.last.id preserved');

        // Dynamic key (emails) — full data
        assert.equal(user.usage.emails.period, 5, 'emails.period preserved');
        assert.equal(user.usage.emails.total, 50, 'emails.total preserved');
        assert.equal(user.usage.emails.last.id, 'e1', 'emails.last.id preserved');

        // Dynamic key (sends) — partial data, template fills in missing
        assert.equal(user.usage.sends.period, 3, 'sends.period preserved');
        assert.equal(user.usage.sends.total, 30, 'sends.total preserved');
        assert.equal(user.usage.sends.last.id, null, 'sends.last.id defaulted to null');
        assert.ok(user.usage.sends.last.timestamp, 'sends.last.timestamp defaulted');
        assert.equal(typeof user.usage.sends.last.timestampUNIX, 'number', 'sends.last.timestampUNIX defaulted to number');
      },
    },

    {
      name: 'usage-only-requests-when-no-extra-keys',
      async run({ assert }) {
        const user = createUser({});

        assert.ok(user.usage.requests, 'usage.requests should exist');
        assert.equal(Object.keys(user.usage).length, 1, 'usage should only have requests key');
      },
    },

    // ─── $passthrough: utm.tags ───

    {
      name: 'utm-tags-passthrough-preserves-all-tags',
      async run({ assert }) {
        const user = createUser({
          attribution: {
            utm: {
              tags: { source: 'google', medium: 'cpc', campaign: 'summer' },
              timestamp: '2025-06-01T00:00:00.000Z',
            },
          },
        });

        assert.equal(user.attribution.utm.tags.source, 'google', 'utm source preserved');
        assert.equal(user.attribution.utm.tags.medium, 'cpc', 'utm medium preserved');
        assert.equal(user.attribution.utm.tags.campaign, 'summer', 'utm campaign preserved');
        assert.equal(user.attribution.utm.timestamp, '2025-06-01T00:00:00.000Z', 'utm timestamp preserved');
      },
    },

    // ─── Type coercion ───

    {
      name: 'coerces-number-from-string',
      async run({ assert }) {
        const user = createUser({
          activity: { geolocation: { latitude: '42.5', longitude: '-73.2' } },
          personal: { telephone: { countryCode: '44', national: '7911123456' } },
        });

        assert.equal(user.activity.geolocation.latitude, 42.5, 'string "42.5" coerced to number');
        assert.equal(user.activity.geolocation.longitude, -73.2, 'string "-73.2" coerced to number');
        assert.equal(user.personal.telephone.countryCode, 44, 'string "44" coerced to number');
      },
    },

    {
      name: 'coerces-boolean-from-number',
      async run({ assert }) {
        const user = createUser({
          auth: { temporary: 1 },
          activity: { client: { mobile: 0 } },
        });

        assert.equal(user.auth.temporary, true, '1 coerced to true');
        assert.equal(user.activity.client.mobile, false, '0 coerced to false');
      },
    },

    {
      name: 'coerces-boolean-from-string',
      async run({ assert }) {
        const user = createUser({
          auth: { temporary: 'true' },
          roles: { admin: 'false' },
        });

        assert.equal(user.auth.temporary, true, '"true" coerced to true');
        assert.equal(user.roles.admin, false, '"false" coerced to false');
      },
    },

    {
      name: 'invalid-coercion-falls-back-to-default',
      async run({ assert }) {
        const user = createUser({
          activity: { geolocation: { latitude: 'not-a-number', longitude: undefined } },
          personal: { telephone: { national: 'abc' } },
        });

        assert.equal(user.activity.geolocation.latitude, 0, 'invalid string falls back to default 0');
        assert.equal(user.activity.geolocation.longitude, 0, 'undefined falls back to default 0');
        assert.equal(user.personal.telephone.national, 0, 'non-numeric string falls back to default 0');
      },
    },

    // ─── Nullable fields ───

    {
      name: 'nullable-fields-preserve-null',
      async run({ assert }) {
        const user = createUser({
          auth: { uid: null, email: null },
          personal: { name: { first: null, last: null }, gender: null },
          activity: { geolocation: { ip: null, country: null } },
        });

        assert.equal(user.auth.uid, null, 'null uid preserved');
        assert.equal(user.auth.email, null, 'null email preserved');
        assert.equal(user.personal.name.first, null, 'null first name preserved');
        assert.equal(user.personal.gender, null, 'null gender preserved');
        assert.equal(user.activity.geolocation.ip, null, 'null ip preserved');
      },
    },

    {
      name: 'non-nullable-fields-replace-null-with-default',
      async run({ assert }) {
        const user = createUser({
          auth: { temporary: null },
          roles: { admin: null },
          activity: { geolocation: { latitude: null } },
        });

        // These are non-nullable, so null should be replaced with the schema default
        assert.equal(user.auth.temporary, false, 'null temporary replaced with false');
        assert.equal(user.roles.admin, false, 'null admin replaced with false');
        assert.equal(user.activity.geolocation.latitude, 0, 'null latitude replaced with 0');
      },
    },

    // ─── Fragmented / incomplete users ───

    {
      name: 'partial-subscription-fills-missing-fields',
      async run({ assert }) {
        const user = createUser({
          subscription: { product: { id: 'premium' } },
        });

        assert.equal(user.subscription.product.id, 'premium', 'provided id preserved');
        assert.equal(user.subscription.product.name, 'Basic', 'missing name gets default');
        assert.equal(user.subscription.status, 'active', 'missing status gets default');
        assert.equal(user.subscription.trial.claimed, false, 'missing trial.claimed gets default');
        assert.ok(user.subscription.expires.timestamp, 'missing expires gets default timestamp');
      },
    },

    {
      name: 'partial-activity-fills-missing-fields',
      async run({ assert }) {
        const user = createUser({
          activity: { geolocation: { country: 'US' } },
        });

        assert.equal(user.activity.geolocation.country, 'US', 'provided country preserved');
        assert.equal(user.activity.geolocation.ip, null, 'missing ip defaults to null');
        assert.equal(user.activity.geolocation.latitude, 0, 'missing latitude defaults to 0');
        assert.ok(user.activity.lastActivity.timestamp, 'missing lastActivity gets default');
        assert.ok(user.activity.created.timestamp, 'missing created gets default');
      },
    },

    {
      name: 'deeply-nested-partial-payment-fills-correctly',
      async run({ assert }) {
        const user = createUser({
          subscription: {
            payment: { processor: 'stripe', resourceId: 'sub_123' },
          },
        });

        assert.equal(user.subscription.payment.processor, 'stripe', 'processor preserved');
        assert.equal(user.subscription.payment.resourceId, 'sub_123', 'resourceId preserved');
        assert.equal(user.subscription.payment.frequency, null, 'missing frequency defaults to null');
        assert.ok(user.subscription.payment.startDate.timestamp, 'missing startDate gets default');
        assert.equal(user.subscription.payment.updatedBy.event.name, null, 'missing event.name defaults to null');
      },
    },

    // ─── Top-level structure ───

    {
      name: 'all-top-level-keys-present',
      async run({ assert }) {
        const user = createUser({});
        const expectedKeys = [
          'auth', 'subscription', 'roles', 'flags', 'affiliate',
          'activity', 'api', 'usage', 'personal', 'oauth2', 'attribution',
        ];

        for (const key of expectedKeys) {
          assert.ok(key in user, `Top-level key "${key}" should exist`);
        }
      },
    },

    {
      name: 'no-extra-top-level-keys',
      async run({ assert }) {
        const user = createUser({});
        const expectedKeys = [
          'auth', 'subscription', 'roles', 'flags', 'affiliate',
          'activity', 'api', 'usage', 'personal', 'oauth2', 'attribution',
        ];

        for (const key of Object.keys(user)) {
          assert.ok(expectedKeys.includes(key), `Unexpected top-level key "${key}"`);
        }
      },
    },

    // ─── Unique/generated values ───

    {
      name: 'api-keys-are-unique-per-call',
      async run({ assert }) {
        const u1 = createUser({});
        const u2 = createUser({});

        // privateKey uses UIDGenerator which should produce unique values
        assert.notEqual(u1.api.privateKey, u2.api.privateKey, 'privateKey should be unique per call');
        assert.notEqual(u1.api.clientId, u2.api.clientId, 'clientId should be unique per call');
      },
    },

    {
      name: 'existing-api-keys-not-overwritten',
      async run({ assert }) {
        const user = createUser({
          api: { clientId: 'my-client-id', privateKey: 'my-secret-key' },
        });

        assert.equal(user.api.clientId, 'my-client-id', 'existing clientId preserved');
        assert.equal(user.api.privateKey, 'my-secret-key', 'existing privateKey preserved');
      },
    },

    // ─── Complex real-world user ───

    {
      name: 'full-real-world-user-preserves-everything',
      async run({ assert }) {
        const user = createUser({
          auth: { uid: 'V4U9wR0AiLUQRxpcP7WhgA4FX9H2', email: 'ian@example.com', temporary: false },
          subscription: {
            product: { id: 'premium', name: 'Premium' },
            status: 'active',
            expires: { timestamp: '2026-12-31T00:00:00.000Z', timestampUNIX: 1798761600 },
            trial: { claimed: true, expires: { timestamp: '2024-01-01T00:00:00.000Z', timestampUNIX: 1704067200 } },
            payment: { processor: 'stripe', resourceId: 'sub_abc', frequency: 'annually' },
          },
          roles: { admin: true, betaTester: true, developer: true, superAdmin: true },
          flags: { signupProcessed: true, onboarded: true },
          affiliate: { code: 'IAN7', referrals: ['ref1', 'ref2'] },
          api: { clientId: 'uuid-123', privateKey: 'key-456' },
          oauth2: {
            google: {
              token: { access_token: 'ya29.real', refresh_token: '1//real', expiry_date: 1700000000 },
              identity: { email: 'ian@gmail.com', name: 'Ian W', picture: 'https://photo.url' },
            },
          },
          usage: {
            requests: { period: 100, total: 5000, last: { id: 'req-z', timestamp: '2025-12-01T00:00:00.000Z', timestampUNIX: 1764633600 } },
            emails: { period: 42, total: 2100, last: { id: 'em-z', timestamp: '2025-12-01T00:00:00.000Z', timestampUNIX: 1764633600 } },
          },
          personal: {
            name: { first: 'Ian', last: 'Wiedenman' },
            company: { name: 'ITW Creative Works', position: 'CEO' },
            birthday: { timestamp: '1990-05-15T00:00:00.000Z', timestampUNIX: 642988800 },
          },
          attribution: {
            affiliate: { code: 'PARTNER1', timestamp: '2024-06-01T00:00:00.000Z' },
            utm: { tags: { source: 'twitter', campaign: 'launch' }, url: 'https://example.com' },
          },
        });

        // Everything should be preserved exactly
        assert.equal(user.auth.uid, 'V4U9wR0AiLUQRxpcP7WhgA4FX9H2', 'uid preserved');
        assert.equal(user.subscription.product.id, 'premium', 'product preserved');
        assert.equal(user.roles.superAdmin, true, 'custom role preserved');
        assert.equal(user.flags.onboarded, true, 'custom flag preserved');
        assert.equal(user.affiliate.code, 'IAN7', 'affiliate code preserved');
        assert.deepEqual(user.affiliate.referrals, ['ref1', 'ref2'], 'referrals preserved');
        assert.equal(user.api.clientId, 'uuid-123', 'api clientId preserved');
        assert.equal(user.oauth2.google.token.access_token, 'ya29.real', 'oauth2 token preserved');
        assert.equal(user.oauth2.google.identity.email, 'ian@gmail.com', 'oauth2 identity preserved');
        assert.equal(user.usage.emails.period, 42, 'usage emails preserved');
        assert.equal(user.personal.name.first, 'Ian', 'name preserved');
        assert.equal(user.personal.company.name, 'ITW Creative Works', 'company preserved');
        assert.equal(user.personal.birthday.timestampUNIX, 642988800, 'birthday preserved');
        assert.equal(user.attribution.utm.tags.source, 'twitter', 'utm tags preserved');
      },
    },
  ],
};
