/**
 * Test: POST /marketing/webhook
 *
 * Cross-provider unsubscribe webhook receiver. Phase E covers SendGrid;
 * Beehiiv will be added in a separate file.
 *
 * Dispatcher tests:
 *   - Auth via ?key= query param
 *   - Provider validation
 *   - Brand filter (ignore mismatched brand)
 *   - Idempotent re-delivery (handlers re-run safely; no dedup ledger)
 *
 * SendGrid processor tests:
 *   - Various event types (group_unsubscribe, unsubscribe, spamreport, bounce, dropped)
 *   - Email lookup → user doc mutation with source='sendgrid'
 *   - Silent skip when email doesn't map to a user (shared SendGrid account scenario)
 *   - Batched events processed independently
 *   - Unsupported event types ignored
 */
const { TEST_ACCOUNTS } = require('../../../src/test/test-accounts.js');

// Helper — generate a unique sg_event_id per test
function sgEventId(name) {
  return `_test-sg-${name}-${Date.now()}`;
}

// Helper — build a SendGrid event payload
function sgEvent({ id, type, email, timestamp, asmGroupId }) {
  return {
    sg_event_id: id,
    event: type,
    email,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
    ...(asmGroupId !== undefined ? { asm_group_id: asmGroupId } : {}),
  };
}

module.exports = {
  description: 'Marketing webhook endpoint (SendGrid)',
  type: 'group',
  timeout: 30000,

  tests: [
    // ─── Dispatcher auth + validation ───

    {
      name: 'rejects-missing-provider',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('marketing/webhook', []);
        assert.isError(response, 400, 'Should reject missing provider');
      },
    },

    {
      name: 'rejects-missing-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('marketing/webhook?provider=sendgrid', []);
        assert.isError(response, 401, 'Should reject missing key');
      },
    },

    {
      name: 'rejects-invalid-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('marketing/webhook?provider=sendgrid&key=wrong-key', []);
        assert.isError(response, 401, 'Should reject invalid key');
      },
    },

    {
      name: 'rejects-unknown-provider',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(
          `marketing/webhook?provider=unknown&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          []
        );
        assert.isError(response, 400, 'Should reject unknown provider');
      },
    },

    {
      name: 'ignores-mismatched-brand',
      auth: 'none',
      async run({ http, assert }) {
        // Brand filter should silently ignore (200 with ignored: true), not error
        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}&brand=some-other-brand-that-does-not-exist`,
          []
        );
        assert.isSuccess(response, 'Should silently ignore mismatched brand (200 OK)');
        assert.propertyEquals(response, 'data.ignored', true, 'Response should indicate ignored');
      },
    },

    // ─── SendGrid processor — supported events ───

    {
      name: 'sendgrid-group-unsubscribe-writes-consent',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = sgEventId('group-unsub');
        const eventTimestamp = Math.floor(Date.now() / 1000);

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'group_unsubscribe', email, timestamp: eventTimestamp, asmGroupId: 25928 })]
        );

        assert.isSuccess(response, `Webhook should accept group_unsubscribe: ${JSON.stringify(response, null, 2)}`);
        assert.propertyEquals(response, 'data.processed', 1, 'Should report 1 event processed');

        // User doc should now show revoked marketing with source=sendgrid
        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'marketing.status should be revoked');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'sendgrid', 'revokedAt.source should be sendgrid');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.timestampUNIX, eventTimestamp, 'revokedAt.timestampUNIX should match event timestamp');
      },
    },

    {
      name: 'sendgrid-unsubscribe-event-handled',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = sgEventId('unsub');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'unsubscribe', email })]
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 1, 'Should process the unsubscribe event');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'marketing.status should be revoked');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'sendgrid', 'source should be sendgrid');
      },
    },

    {
      name: 'sendgrid-spamreport-event-handled',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = sgEventId('spamreport');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'spamreport', email })]
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 1, 'Spamreport should be treated as a revoke');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked');
      },
    },

    {
      name: 'sendgrid-bounce-event-handled',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = sgEventId('bounce');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'bounce', email })]
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 1, 'Bounce should be treated as a revoke');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked');
      },
    },

    // ─── SendGrid processor — events we ignore ───

    {
      name: 'sendgrid-delivered-event-ignored',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const email = accounts.basic.email;
        const eventId = sgEventId('delivered');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'delivered', email })]
        );

        assert.isSuccess(response, 'Should accept the request (not error) but ignore the event');
        assert.propertyEquals(response, 'data.processed', 0, 'No events should be processed');
        assert.propertyEquals(response, 'data.skipped', 1, '1 event should be skipped');
      },
    },

    {
      name: 'sendgrid-open-event-ignored',
      auth: 'none',
      async run({ http, assert, accounts }) {
        const email = accounts.basic.email;
        const eventId = sgEventId('open');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'open', email })]
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 0, 'Open events should be ignored');
      },
    },

    // ─── Email not mapped to a user ───

    {
      name: 'sendgrid-unknown-email-silent-skip',
      auth: 'none',
      async run({ http, assert }) {
        // Email that doesn't match any user in this brand's Firestore — shared SendGrid scenario
        const eventId = sgEventId('unknown-email');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'group_unsubscribe', email: '_test.never-existed@example.com' })]
        );

        // Dispatcher still runs the handler (which returns handled:false). From the
        // dispatcher's POV this counts as 'processed=1' since the handler didn't throw.
        // The handler's internal "user-not-found" branch is silent by design.
        assert.isSuccess(response, 'Should accept unknown-email gracefully');
        assert.propertyEquals(response, 'data.failed', 0, 'No failures for unknown email');
      },
    },

    // ─── Batched events ───

    {
      name: 'sendgrid-batched-events-processed-independently',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const e1 = sgEventId('batch-1');
        const e2 = sgEventId('batch-2');
        const e3 = sgEventId('batch-3');

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [
            sgEvent({ id: e1, type: 'group_unsubscribe', email }),
            sgEvent({ id: e2, type: 'open', email }), // ignored — unsupported type
            sgEvent({ id: e3, type: 'spamreport', email }),
          ]
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 2, '2 supported events should be processed');
        assert.propertyEquals(response, 'data.skipped', 1, '1 unsupported event should be skipped');

        // User doc should be revoked
        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked');
      },
    },

    // ─── Idempotent re-delivery (no dedup ledger) ───

    {
      name: 'sendgrid-duplicate-event-reprocessed-idempotently',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = sgEventId('duplicate');

        // First delivery
        const response1 = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'group_unsubscribe', email })]
        );
        assert.isSuccess(response1);
        assert.propertyEquals(response1, 'data.processed', 1, 'First delivery should process');

        // Second delivery — same eventId. With no dedup ledger the handler runs
        // again, but the revoke is idempotent so the end state is unchanged.
        const response2 = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [sgEvent({ id: eventId, type: 'group_unsubscribe', email })]
        );
        assert.isSuccess(response2);
        assert.propertyEquals(response2, 'data.processed', 1, 'Re-delivery reprocesses (idempotent), not skipped');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'User remains revoked after re-delivery');
      },
    },

    // ─── Missing event ID — still processed (no dedup requirement) ───

    {
      name: 'sendgrid-event-without-eventId-processed',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;

        const response = await http.as('none').post(
          `marketing/webhook?provider=sendgrid&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          [{ event: 'group_unsubscribe', email, timestamp: Math.floor(Date.now() / 1000) }] // NO sg_event_id
        );

        assert.isSuccess(response, 'Should accept the request');
        assert.propertyEquals(response, 'data.processed', 1, 'Event without eventId is still processed (no dedup needed)');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'User should be revoked');
      },
    },

    // ──────────────────────────────────────────────────────────────────────
    // Beehiiv processor tests
    // ──────────────────────────────────────────────────────────────────────

    {
      name: 'beehiiv-subscription-unsubscribed-writes-consent',
      auth: 'none',
      async run({ http, firestore, assert, accounts, config, skip }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = `_test-bh-unsub-${Date.now()}`;
        const eventISO = new Date().toISOString();
        const publicationId = config.marketing?.beehiiv?.publicationId;

        if (!publicationId) {
          return skip('No Beehiiv publication ID configured for this brand');
        }

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.unsubscribed',
            email,
            publication_id: publicationId,
            created_at: eventISO,
          }
        );

        assert.isSuccess(response, `Beehiiv unsub should succeed: ${JSON.stringify(response, null, 2)}`);
        assert.propertyEquals(response, 'data.processed', 1, 'Should process 1 event');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'marketing.status should be revoked');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'beehiiv', 'revokedAt.source should be beehiiv');
        assert.ok(userDoc?.consent?.marketing?.revokedAt?.timestamp, 'revokedAt.timestamp should be set');
      },
    },

    {
      name: 'beehiiv-subscription-deleted-handled',
      auth: 'none',
      async run({ http, firestore, assert, accounts, config }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = `_test-bh-deleted-${Date.now()}`;
        const publicationId = config.marketing?.beehiiv?.publicationId;

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.deleted',
            email,
            publication_id: publicationId,
            created_at: new Date().toISOString(),
          }
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 1, 'subscription.deleted should be processed as a revoke');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked');
        assert.equal(userDoc?.consent?.marketing?.revokedAt?.source, 'beehiiv');
      },
    },

    {
      name: 'beehiiv-subscription-paused-handled',
      auth: 'none',
      async run({ http, firestore, assert, accounts, config }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const eventId = `_test-bh-paused-${Date.now()}`;
        const publicationId = config.marketing?.beehiiv?.publicationId;

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.paused',
            email,
            publication_id: publicationId,
            created_at: new Date().toISOString(),
          }
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 1, 'subscription.paused should be processed as a revoke');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked');
      },
    },

    {
      name: 'beehiiv-publication-mismatch-silent-skip',
      auth: 'none',
      async run({ http, firestore, assert, accounts }) {
        // Send an event with a publication_id that does NOT match this brand's pub.
        // Simulates the shared-devbeans scenario where the parent forwarder fans
        // an event to brands that don't share the publication — they silent-skip.
        const email = accounts.basic.email;
        const eventId = `_test-bh-pubmismatch-${Date.now()}`;

        // Snapshot revokedAt BEFORE the request so we can prove the pub-mismatch
        // handler didn't write anything new. (The basic account may already have
        // a beehiiv-sourced revoke from a prior test that legitimately fired.)
        const beforeDoc = await firestore.get(`users/${accounts.basic.uid}`);
        const beforeRevokedAt = beforeDoc?.consent?.marketing?.revokedAt || null;

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.unsubscribed',
            email,
            publication_id: 'pub_does-not-belong-to-this-brand-xxxxxxxxxxxxxx',
            created_at: new Date().toISOString(),
          }
        );

        // The dispatcher counts this as 'processed' from its POV (the handler
        // ran without error), but the handler returned
        // { handled: false, reason: 'publication-mismatch' }.
        // What matters: the user doc should NOT have been mutated.
        assert.isSuccess(response, 'Pub-mismatch event should be accepted gracefully');

        // Reload the user doc and verify revokedAt is byte-equivalent to before —
        // pub-mismatch must not write a new revoke entry.
        const afterDoc = await firestore.get(`users/${accounts.basic.uid}`);
        const afterRevokedAt = afterDoc?.consent?.marketing?.revokedAt || null;

        assert.deepEqual(
          afterRevokedAt,
          beforeRevokedAt,
          'consent.marketing.revokedAt must be UNCHANGED after a pub-mismatch event (handler should silent-skip)'
        );
      },
    },

    {
      name: 'beehiiv-unknown-email-silent-skip',
      auth: 'none',
      async run({ http, assert, config }) {
        // Email that doesn't map to any user — shared publication scenario where
        // multiple brands receive the same event but only one has the user.
        const publicationId = config.marketing?.beehiiv?.publicationId;
        const eventId = `_test-bh-unknown-${Date.now()}`;

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.unsubscribed',
            email: '_test.no-such-user@example.com',
            publication_id: publicationId,
            created_at: new Date().toISOString(),
          }
        );

        assert.isSuccess(response, 'Unknown email should not error');
        assert.propertyEquals(response, 'data.failed', 0, 'No failures for unknown email');
      },
    },

    {
      name: 'beehiiv-unsupported-event-ignored',
      auth: 'none',
      async run({ http, assert, accounts, config }) {
        // 'subscription.created' (new signup) is NOT a revoke — should be ignored.
        const email = accounts.basic.email;
        const publicationId = config.marketing?.beehiiv?.publicationId;
        const eventId = `_test-bh-created-${Date.now()}`;

        const response = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          {
            id: eventId,
            event: 'subscription.created',
            email,
            publication_id: publicationId,
            created_at: new Date().toISOString(),
          }
        );

        assert.isSuccess(response);
        assert.propertyEquals(response, 'data.processed', 0, 'Unsupported events should not be processed');
        assert.propertyEquals(response, 'data.skipped', 1, 'Unsupported events should be skipped');
      },
    },

    {
      name: 'beehiiv-duplicate-event-reprocessed-idempotently',
      auth: 'none',
      async run({ http, firestore, assert, accounts, config, skip }) {
        const uid = accounts.basic.uid;
        const email = accounts.basic.email;
        const publicationId = config.marketing?.beehiiv?.publicationId;
        const eventId = `_test-bh-dup-${Date.now()}`;

        if (!publicationId) {
          return skip('No Beehiiv publication ID configured for this brand');
        }

        const payload = {
          id: eventId,
          event: 'subscription.unsubscribed',
          email,
          publication_id: publicationId,
          created_at: new Date().toISOString(),
        };

        // First delivery
        const r1 = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          payload
        );
        assert.isSuccess(r1);
        assert.propertyEquals(r1, 'data.processed', 1, 'First delivery should process');

        // Second delivery — same id. No dedup ledger, so it reprocesses; the
        // revoke is idempotent so the end state is unchanged.
        const r2 = await http.as('none').post(
          `marketing/webhook?provider=beehiiv&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`,
          payload
        );
        assert.isSuccess(r2);
        assert.propertyEquals(r2, 'data.processed', 1, 'Re-delivery reprocesses (idempotent), not skipped');

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.consent?.marketing?.status, 'revoked', 'User remains revoked after re-delivery');
      },
    },
  ],
};
