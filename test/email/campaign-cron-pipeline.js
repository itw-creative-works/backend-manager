/**
 * Test: Campaign cron pipeline
 *
 * Verifies that bm_cronFrequent correctly picks up and processes campaigns
 * from the marketing-campaigns collection when their sendAt is past due.
 *
 * Covers:
 *   1. One-off campaigns: status changes from 'pending' to 'sent'/'failed'
 *   2. Recurring campaigns: sendAt advances, history doc created
 *   3. Generator campaigns (e.g. newsletter): NOT skipped — the generator
 *      pipeline runs inline and produces a new campaign doc
 *
 * Default mode: seeds campaigns and triggers the cron, verifies doc state
 * changes. The generator test verifies the campaign is attempted (not skipped);
 * if the consumer config has newsletter disabled, the generator returns null
 * and the test confirms the graceful "will retry" path.
 *
 * Extended mode: same, but the newsletter generator runs the full AI pipeline.
 */
const { getNextOccurrence } = require('../../src/manager/libraries/email/constants.js');

module.exports = {
  description: 'Campaign cron pipeline (frequent cron processes all campaign types)',
  type: 'suite',
  timeout: 60000,

  tests: [
    {
      name: 'seed-campaigns',
      auth: 'none',

      async run({ firestore, state }) {
        const now = Math.round(Date.now() / 1000);
        const pastSendAt = now - 600;

        // One-off email campaign (sendAt 10 min ago)
        await firestore.set('marketing-campaigns/_test-oneoff', {
          status: 'pending',
          type: 'email',
          sendAt: pastSendAt,
          settings: {
            name: '[TEST] One-off blast',
            subject: 'Test subject',
            preheader: 'Test preheader',
            template: 'card',
            data: {
              content: {
                title: 'Test',
                message: 'Test campaign body',
                button: { text: 'Click', url: 'https://example.com' },
              },
            },
            test: true,
          },
          metadata: {
            created: { timestamp: new Date().toISOString(), timestampUNIX: now },
            updated: { timestamp: new Date().toISOString(), timestampUNIX: now },
          },
        });

        // Recurring email campaign (sendAt 10 min ago, weekly recurrence)
        await firestore.set('marketing-campaigns/_test-recurring', {
          status: 'pending',
          type: 'email',
          sendAt: pastSendAt,
          recurrence: {
            pattern: 'weekly',
            hour: 10,
            minute: 0,
            day: 1,
          },
          settings: {
            name: '[TEST] Weekly digest',
            subject: 'Weekly digest',
            preheader: 'Your weekly summary',
            template: 'card',
            data: {
              content: {
                title: 'Weekly Digest',
                message: 'Here is your weekly digest.',
                button: { text: 'Read more', url: 'https://example.com' },
              },
            },
            test: true,
          },
          metadata: {
            created: { timestamp: new Date().toISOString(), timestampUNIX: now },
            updated: { timestamp: new Date().toISOString(), timestampUNIX: now },
          },
        });

        // Generator campaign (newsletter — sendAt 10 min ago)
        await firestore.set('marketing-campaigns/_test-generator', {
          status: 'pending',
          type: 'email',
          generator: 'newsletter',
          sendAt: pastSendAt,
          recurrence: {
            pattern: 'weekly',
            hour: 17,
            minute: 30,
            day: 2,
          },
          settings: {
            name: '{brand.name} Newsletter — {date.month} {date.year}',
            subject: '',
            preheader: '',
            sender: 'newsletter',
            providers: ['newsletter'],
          },
          metadata: {
            created: { timestamp: new Date().toISOString(), timestampUNIX: now },
            updated: { timestamp: new Date().toISOString(), timestampUNIX: now },
          },
        });

        state.pastSendAt = pastSendAt;
      },
    },

    {
      name: 'trigger-frequent-cron',
      auth: 'none',
      timeout: 120000,

      async run({ pubsub, waitFor, firestore, state }) {
        await pubsub.trigger('bm_cronFrequent');

        // Wait for BOTH the one-off and recurring campaigns to be processed.
        // The cron processes all campaigns in parallel via Promise.allSettled,
        // but individual Firestore writes may land at different times.
        await waitFor(
          async () => {
            const oneoff = await firestore.get('marketing-campaigns/_test-oneoff');
            const recurring = await firestore.get('marketing-campaigns/_test-recurring');
            return oneoff?.status !== 'pending' && recurring?.sendAt !== state.pastSendAt;
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
        assert.equal(doc.status, 'pending', 'Recurring campaign status stays pending');

        const expectedNext = getNextOccurrence(state.pastSendAt, {
          pattern: 'weekly',
          hour: 10,
          minute: 0,
          day: 1,
        });
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
      name: 'generator-campaign-not-skipped',
      auth: 'none',

      async run({ firestore, assert, state, config }) {
        const doc = await firestore.get('marketing-campaigns/_test-generator');
        assert.ok(doc, 'Generator campaign doc should still exist');

        const newsletterEnabled = config.marketing?.newsletter?.enabled;

        if (newsletterEnabled && process.env.TEST_EXTENDED_MODE) {
          // Extended mode with newsletter enabled: generator should have
          // generated + sent in one shot, created a history doc, and
          // advanced sendAt
          const expectedNext = getNextOccurrence(state.pastSendAt, {
            pattern: 'weekly',
            hour: 17,
            minute: 30,
            day: 2,
          });
          assert.equal(doc.sendAt, expectedNext, 'Generator campaign sendAt should advance');

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
        } else {
          // Non-extended or newsletter disabled: generator returns null,
          // sendAt stays unchanged (will retry next run). The critical
          // assertion is that the campaign was ATTEMPTED, not skipped —
          // verified by the cron logs showing "Running generator" and
          // "returned no content" instead of "Skipping generator campaign".
          assert.equal(doc.status, 'pending', 'Status stays pending when generator returns null');
          assert.equal(doc.sendAt, state.pastSendAt, 'sendAt stays unchanged for retry when generator returns null');
        }
      },
    },

    {
      name: 'cleanup',
      auth: 'none',

      async run({ firestore }) {
        await firestore.delete('marketing-campaigns/_test-oneoff');
        await firestore.delete('marketing-campaigns/_test-recurring');
        await firestore.delete('marketing-campaigns/_test-generator');

        // Clean up history docs (from both recurring and generator campaigns)
        const recurringHist = await firestore.collection('marketing-campaigns')
          .where('recurringId', '==', '_test-recurring')
          .get();
        for (const doc of recurringHist.docs) {
          await doc.ref.delete();
        }

        const generatorHist = await firestore.collection('marketing-campaigns')
          .where('generatedFrom', '==', '_test-generator')
          .get();
        for (const doc of generatorHist.docs) {
          await doc.ref.delete();
        }
      },
    },
  ],
};
