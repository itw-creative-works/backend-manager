/**
 * Test: Campaign cron pipeline
 *
 * Verifies that bm_cronFrequent correctly picks up and processes campaigns
 * from the marketing-campaigns collection when their sendAt is past due.
 *
 * Covers:
 *   1. One-off campaigns: status changes from 'pending' to 'sent'/'failed'
 *   2. Recurring campaigns: sendAt advances, history doc created, status
 *      returns to 'pending'
 *   3. Generator campaigns (e.g. newsletter): NOT skipped — the generator
 *      pipeline runs inline; when it yields nothing the campaign stays
 *      pending with generatorAttempts incremented (retry next run)
 *   4. Claim/lease lifecycle: stale 'processing' leases are reclaimed and
 *      re-processed; fresh leases are left alone (no double-send)
 *   5. Unknown campaign types / generators are marked 'failed' (config
 *      typos must not retry forever)
 *   6. Generator retry cap: after GENERATOR_MAX_ATTEMPTS empty runs, a
 *      recurring campaign skips to its next occurrence and a one-off fails
 *   7. Catch-up-safe advance: a recurring campaign stalled multiple periods
 *      advances to the next FUTURE occurrence (no catch-up burst)
 *
 * Default mode: the newsletter generator is gated by TEST_EXTENDED_MODE and
 * returns null — the suite verifies the retry bookkeeping deterministically
 * with zero AI cost. Extended mode: the generator runs the full AI pipeline
 * and the suite verifies the generated history doc + sendAt advance.
 */
const {
  getNextOccurrence,
  getNextFutureOccurrence,
} = require('../../src/manager/libraries/email/constants.js');
const {
  PROCESSING_LEASE_SECONDS,
  GENERATOR_MAX_ATTEMPTS,
} = require('../../src/manager/events/cron/frequent/marketing-campaigns.js');

const WEEK = 7 * 86400;

function stamp(now) {
  return { timestamp: new Date(now * 1000).toISOString(), timestampUNIX: now };
}

function emailSettings(name) {
  return {
    name,
    subject: `${name} subject`,
    preheader: `${name} preheader`,
    template: 'card',
    data: {
      content: {
        title: name,
        message: `${name} body`,
        button: { text: 'Click', url: 'https://example.com' },
      },
    },
    test: true,
  };
}

module.exports = {
  description: 'Campaign cron pipeline (frequent cron processes all campaign types)',
  type: 'suite',
  timeout: 60000,

  tests: [
    {
      name: 'get-next-future-occurrence-pure',
      auth: 'none',

      async run({ assert }) {
        const now = Math.round(Date.now() / 1000);
        const weekly = { pattern: 'weekly', hour: 10, minute: 0, day: 1 };

        // Near-past sendAt: single-step advance already lands in the future
        const recent = now - 600;
        assert.equal(
          getNextFutureOccurrence(recent, weekly, now),
          getNextOccurrence(recent, weekly),
          'Single-step advance is preserved when it lands in the future',
        );

        // Stalled 3 weeks: all missed occurrences are skipped
        const stale = now - (3 * WEEK) - 600;
        const next = getNextFutureOccurrence(stale, weekly, now);
        assert.ok(next > now, `Advance from a 3-week-stale anchor must be in the future (got ${next}, now ${now})`);

        let manual = stale;
        for (let i = 0; i < 4; i++) {
          manual = getNextOccurrence(manual, weekly);
        }
        assert.equal(next, manual, 'Skips exactly the missed occurrences (4 weekly steps)');

        // Daily pattern stalled 5 days: lands within the next 24h
        const daily = { pattern: 'daily', hour: 0, minute: 0 };
        const staleDaily = now - (5 * 86400) - 60;
        const nextDaily = getNextFutureOccurrence(staleDaily, daily, now);
        assert.ok(nextDaily > now, 'Daily advance is in the future');
        assert.ok(nextDaily <= now + 86400, 'Daily advance lands within one period of now');
      },
    },

    {
      name: 'seed-campaigns',
      auth: 'none',

      async run({ firestore, state }) {
        const now = Math.round(Date.now() / 1000);
        const pastSendAt = now - 600;
        const staleSendAt = now - (3 * WEEK) - 600;

        state.now = now;
        state.pastSendAt = pastSendAt;
        state.staleSendAt = staleSendAt;

        const meta = { created: stamp(now), updated: stamp(now) };

        // One-off email campaign (sendAt 10 min ago)
        await firestore.set('marketing-campaigns/_test-oneoff', {
          status: 'pending',
          type: 'email',
          sendAt: pastSendAt,
          settings: emailSettings('[TEST] One-off blast'),
          metadata: meta,
        });

        // Recurring email campaign (sendAt 10 min ago, weekly recurrence)
        await firestore.set('marketing-campaigns/_test-recurring', {
          status: 'pending',
          type: 'email',
          sendAt: pastSendAt,
          recurrence: { pattern: 'weekly', hour: 10, minute: 0, day: 1 },
          settings: emailSettings('[TEST] Weekly digest'),
          metadata: meta,
        });

        // Recurring email campaign stalled for 3 weeks — must advance to a
        // FUTURE occurrence in one step (no catch-up burst)
        await firestore.set('marketing-campaigns/_test-recurring-stale', {
          status: 'pending',
          type: 'email',
          sendAt: staleSendAt,
          recurrence: { pattern: 'weekly', hour: 10, minute: 0, day: 1 },
          settings: emailSettings('[TEST] Stale weekly digest'),
          metadata: meta,
        });

        // Generator campaign (newsletter — sendAt 10 min ago)
        await firestore.set('marketing-campaigns/_test-generator', {
          status: 'pending',
          type: 'email',
          generator: 'newsletter',
          sendAt: pastSendAt,
          recurrence: { pattern: 'weekly', hour: 17, minute: 30, day: 2 },
          settings: {
            name: '{brand.name} Newsletter — {date.month} {date.year}',
            subject: '',
            preheader: '',
            sender: 'newsletter',
            providers: ['newsletter'],
          },
          metadata: meta,
        });

        // Unknown generator — a config typo must be marked failed, not
        // retried every 10 minutes forever
        await firestore.set('marketing-campaigns/_test-unknown-generator', {
          status: 'pending',
          type: 'email',
          generator: 'doesnotexist',
          sendAt: pastSendAt,
          settings: emailSettings('[TEST] Unknown generator'),
          metadata: meta,
        });

        // Unknown campaign type — same treatment
        await firestore.set('marketing-campaigns/_test-unknown-type', {
          status: 'pending',
          type: 'carrier-pigeon',
          sendAt: pastSendAt,
          settings: emailSettings('[TEST] Unknown type'),
          metadata: meta,
        });

        // Stale processing lease (crashed run) — must be reclaimed and
        // processed in the same cron run
        await firestore.set('marketing-campaigns/_test-stale-processing', {
          status: 'processing',
          processingStartedAt: now - PROCESSING_LEASE_SECONDS - 600,
          type: 'email',
          sendAt: pastSendAt,
          settings: emailSettings('[TEST] Stale processing reclaim'),
          metadata: meta,
        });

        // Fresh processing lease (another run is mid-flight) — must be left
        // completely alone
        await firestore.set('marketing-campaigns/_test-fresh-processing', {
          status: 'processing',
          processingStartedAt: now - 60,
          type: 'email',
          sendAt: pastSendAt,
          settings: emailSettings('[TEST] Fresh processing lease'),
          metadata: meta,
        });

        // Retry-cap seeds run the real generator in extended mode, so they
        // are DEFAULT-MODE ONLY (the generator nulls instantly via the
        // test-mode gate, letting us exercise the cap deterministically).
        if (!process.env.TEST_EXTENDED_MODE) {
          // One-off generator at the attempts cap → must be marked failed
          await firestore.set('marketing-campaigns/_test-gen-cap-oneoff', {
            status: 'pending',
            type: 'email',
            generator: 'newsletter',
            sendAt: pastSendAt,
            generatorAttempts: GENERATOR_MAX_ATTEMPTS - 1,
            settings: emailSettings('[TEST] Generator cap one-off'),
            metadata: meta,
          });

          // Recurring generator at the attempts cap, stalled 3 weeks → must
          // skip to the next FUTURE occurrence and reset the counter
          await firestore.set('marketing-campaigns/_test-gen-cap-recurring', {
            status: 'pending',
            type: 'email',
            generator: 'newsletter',
            sendAt: staleSendAt,
            generatorAttempts: GENERATOR_MAX_ATTEMPTS - 1,
            recurrence: { pattern: 'weekly', hour: 10, minute: 0, day: 1 },
            settings: emailSettings('[TEST] Generator cap recurring'),
            metadata: meta,
          });
        }
      },
    },

    {
      name: 'trigger-frequent-cron',
      auth: 'none',
      timeout: 120000,

      async run({ pubsub, waitFor, firestore, state }) {
        await pubsub.trigger('bm_cronFrequent');

        // Wait for the fast (non-generator) campaigns to reach a terminal
        // state. The cron processes campaigns in parallel via
        // Promise.allSettled, but individual Firestore writes land at
        // different times.
        await waitFor(
          async () => {
            const oneoff = await firestore.get('marketing-campaigns/_test-oneoff');
            const recurring = await firestore.get('marketing-campaigns/_test-recurring');
            const recurringStale = await firestore.get('marketing-campaigns/_test-recurring-stale');
            const staleProcessing = await firestore.get('marketing-campaigns/_test-stale-processing');
            const unknownGenerator = await firestore.get('marketing-campaigns/_test-unknown-generator');
            const unknownType = await firestore.get('marketing-campaigns/_test-unknown-type');

            // 'sent'/'failed' — NOT merely !== 'pending': the claim flips the
            // doc to 'processing' first, and proceeding on that mid-flight
            // state races the send (oneoff-campaign-processed then reads
            // 'processing' and fails).
            return ['sent', 'failed'].includes(oneoff?.status)
              && recurring?.sendAt !== state.pastSendAt
              && recurringStale?.sendAt !== state.staleSendAt
              && ['sent', 'failed'].includes(staleProcessing?.status)
              && unknownGenerator?.status === 'failed'
              && unknownType?.status === 'failed';
          },
          90000,
          1000,
        );
      },
    },

    {
      name: 'oneoff-campaign-processed',
      auth: 'none',

      async run({ firestore, assert }) {
        const doc = await firestore.get('marketing-campaigns/_test-oneoff');

        assert.ok(doc, 'One-off campaign doc should exist');
        assert.ok(
          doc.status === 'sent' || doc.status === 'failed',
          `One-off campaign status should be sent or failed, got: ${doc.status}`,
        );
        assert.ok(doc.metadata?.updated, 'Should have updated metadata');
      },
    },

    {
      name: 'recurring-campaign-advanced',
      auth: 'none',

      async run({ firestore, assert, state }) {
        const doc = await firestore.get('marketing-campaigns/_test-recurring');

        assert.ok(doc, 'Recurring campaign doc should exist');
        assert.equal(doc.status, 'pending', 'Recurring campaign status returns to pending');

        const expectedNext = getNextFutureOccurrence(state.pastSendAt, {
          pattern: 'weekly',
          hour: 10,
          minute: 0,
          day: 1,
        }, state.now);
        assert.equal(doc.sendAt, expectedNext, 'sendAt should advance to next occurrence');
      },
    },

    {
      name: 'recurring-campaign-has-history',
      auth: 'none',

      async run({ firestore, assert }) {
        const snapshot = await firestore.collection('marketing-campaigns')
          .where('recurringId', '==', '_test-recurring')
          .limit(1)
          .get();

        assert.ok(!snapshot.empty, 'Should have a history doc from the recurring campaign');

        const history = snapshot.docs[0].data();
        assert.ok(
          history.status === 'sent' || history.status === 'failed',
          'History doc status should be sent or failed',
        );
        assert.equal(history.recurringId, '_test-recurring', 'Should reference the recurring campaign');
      },
    },

    {
      name: 'stalled-recurring-skips-to-future-occurrence',
      auth: 'none',

      async run({ firestore, assert, state }) {
        const doc = await firestore.get('marketing-campaigns/_test-recurring-stale');

        assert.ok(doc, 'Stale recurring campaign doc should exist');
        assert.equal(doc.status, 'pending', 'Status returns to pending');
        assert.ok(
          doc.sendAt > state.now,
          `sendAt must land in the FUTURE (no catch-up burst) — got ${doc.sendAt}, now ${state.now}`,
        );

        const expectedNext = getNextFutureOccurrence(state.staleSendAt, {
          pattern: 'weekly',
          hour: 10,
          minute: 0,
          day: 1,
        }, state.now);
        assert.equal(doc.sendAt, expectedNext, 'Skips all missed occurrences in one advance');
      },
    },

    {
      name: 'stale-processing-lease-reclaimed-and-processed',
      auth: 'none',

      async run({ firestore, assert }) {
        const doc = await firestore.get('marketing-campaigns/_test-stale-processing');

        assert.ok(doc, 'Stale-processing campaign doc should exist');
        assert.ok(
          doc.status === 'sent' || doc.status === 'failed',
          `Reclaimed campaign should be processed to sent/failed, got: ${doc.status}`,
        );
      },
    },

    {
      name: 'fresh-processing-lease-untouched',
      auth: 'none',

      async run({ firestore, assert, state }) {
        const doc = await firestore.get('marketing-campaigns/_test-fresh-processing');

        assert.ok(doc, 'Fresh-processing campaign doc should exist');
        assert.equal(doc.status, 'processing', 'A fresh lease is honored — no reclaim, no double-send');
        assert.equal(doc.processingStartedAt, state.now - 60, 'processingStartedAt is untouched');
      },
    },

    {
      name: 'unknown-generator-and-type-marked-failed',
      auth: 'none',

      async run({ firestore, assert }) {
        const unknownGenerator = await firestore.get('marketing-campaigns/_test-unknown-generator');
        const unknownType = await firestore.get('marketing-campaigns/_test-unknown-type');

        assert.equal(unknownGenerator?.status, 'failed', 'Unknown generator is marked failed (not retried forever)');
        assert.ok(/doesnotexist/.test(unknownGenerator?.error || ''), 'Error names the unknown generator');
        assert.equal(unknownType?.status, 'failed', 'Unknown type is marked failed (not retried forever)');
        assert.ok(/carrier-pigeon/.test(unknownType?.error || ''), 'Error names the unknown type');
      },
    },

    {
      name: 'generator-campaign-not-skipped',
      auth: 'none',
      timeout: 600000,

      async run({ firestore, assert, state, config, waitFor }) {
        const newsletterEnabled = config.marketing?.newsletter?.enabled;

        if (newsletterEnabled && process.env.TEST_EXTENDED_MODE) {
          // Extended mode with newsletter enabled: the generator runs the
          // full AI pipeline inline (minutes) — wait for the sendAt advance
          // that marks completion, then verify the history doc.
          await waitFor(
            async () => {
              const doc = await firestore.get('marketing-campaigns/_test-generator');
              return doc?.sendAt !== state.pastSendAt;
            },
            570000,
            5000,
          );

          const doc = await firestore.get('marketing-campaigns/_test-generator');
          const expectedNext = getNextFutureOccurrence(state.pastSendAt, {
            pattern: 'weekly',
            hour: 17,
            minute: 30,
            day: 2,
          }, state.now);
          assert.equal(doc.sendAt, expectedNext, 'Generator campaign sendAt should advance');
          assert.equal(doc.status, 'pending', 'Recurring generator returns to pending');

          const histSnapshot = await firestore.collection('marketing-campaigns')
            .where('generatedFrom', '==', '_test-generator')
            .limit(1)
            .get();
          assert.ok(!histSnapshot.empty, 'Should have a history doc from the generator');
          const histDoc = histSnapshot.docs[0].data();
          assert.ok(
            histDoc.status === 'sent' || histDoc.status === 'failed',
            'History doc status should be sent or failed',
          );
          assert.ok(!histDoc.generator, 'History doc should NOT have a generator field');
          assert.ok(!histDoc.settings?.article, 'History settings should NOT carry the full article payload');
        } else {
          // Default mode: the generator is gated by TEST_EXTENDED_MODE and
          // returns null instantly. The campaign must be ATTEMPTED (claimed,
          // generator run) and then released back to pending with the
          // attempts counter incremented — the deterministic retry path.
          await waitFor(
            async () => {
              const doc = await firestore.get('marketing-campaigns/_test-generator');
              return doc?.status === 'pending' && (doc?.generatorAttempts || 0) >= 1;
            },
            30000,
            500,
          );

          const doc = await firestore.get('marketing-campaigns/_test-generator');
          assert.equal(doc.status, 'pending', 'Status returns to pending when generator returns null');
          assert.equal(doc.sendAt, state.pastSendAt, 'sendAt stays unchanged for retry when generator returns null');
          assert.equal(doc.generatorAttempts, 1, 'generatorAttempts is incremented for the retry cap');
        }
      },
    },

    {
      name: 'generator-retry-cap-fails-oneoff-and-skips-recurring',
      auth: 'none',

      async run({ firestore, assert, state, waitFor }) {
        // Default-mode only: extended mode would run the real pipeline for
        // these seeds, so they are not created there.
        if (process.env.TEST_EXTENDED_MODE) {
          return;
        }

        await waitFor(
          async () => {
            const oneoff = await firestore.get('marketing-campaigns/_test-gen-cap-oneoff');
            const recurring = await firestore.get('marketing-campaigns/_test-gen-cap-recurring');
            return oneoff?.status === 'failed' && recurring?.sendAt !== state.staleSendAt;
          },
          30000,
          500,
        );

        const oneoff = await firestore.get('marketing-campaigns/_test-gen-cap-oneoff');
        assert.equal(oneoff.status, 'failed', 'One-off generator at the cap is marked failed');
        assert.ok(/attempts/.test(oneoff.error || ''), 'Error explains the attempts cap');

        const recurring = await firestore.get('marketing-campaigns/_test-gen-cap-recurring');
        assert.equal(recurring.status, 'pending', 'Recurring generator at the cap stays pending');
        assert.ok(recurring.sendAt > state.now, 'Recurring generator at the cap skips to a FUTURE occurrence');
        assert.ok(!recurring.generatorAttempts, 'Attempts counter resets after skipping the occurrence');
      },
    },

    {
      name: 'cleanup',
      auth: 'none',

      async run({ firestore }) {
        const docs = [
          '_test-oneoff',
          '_test-recurring',
          '_test-recurring-stale',
          '_test-generator',
          '_test-unknown-generator',
          '_test-unknown-type',
          '_test-stale-processing',
          '_test-fresh-processing',
          '_test-gen-cap-oneoff',
          '_test-gen-cap-recurring',
        ];

        for (const id of docs) {
          await firestore.delete(`marketing-campaigns/${id}`);
        }

        // Clean up history docs (from recurring and generator campaigns)
        for (const [field, value] of [
          ['recurringId', '_test-recurring'],
          ['recurringId', '_test-recurring-stale'],
          ['recurringId', '_test-stale-processing'],
          ['generatedFrom', '_test-generator'],
        ]) {
          const snapshot = await firestore.collection('marketing-campaigns')
            .where(field, '==', value)
            .get();
          for (const doc of snapshot.docs) {
            await doc.ref.delete();
          }
        }
      },
    },
  ],
};
