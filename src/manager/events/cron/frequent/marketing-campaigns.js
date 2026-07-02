/**
 * Marketing campaigns cron job
 *
 * Picks up campaigns from the `marketing-campaigns` collection that are
 * past their sendAt time and still pending. Dispatches based on type:
 *   - email: fires through mailer.sendCampaign()
 *   - push: fires through notification.send()
 *
 * Claim/lease lifecycle (prevents double-sends across overlapping runs):
 *   - Each due campaign is CLAIMED by transactionally flipping status
 *     'pending' → 'processing' before any work happens. A campaign another
 *     run already claimed is skipped.
 *   - Every terminal path writes a final status: 'sent'/'failed' for
 *     one-offs, back to 'pending' (with an advanced sendAt) for recurring.
 *   - If a run dies mid-flight (crash, function timeout), the doc stays
 *     'processing' until the stale-lease reclaim flips it back to 'pending'
 *     after PROCESSING_LEASE_SECONDS — a natural retry backoff.
 *
 * Generator campaigns (has `generator` field, e.g. 'newsletter'):
 *   - Runs the content generation pipeline (AI content, images, uploads)
 *   - Sends the generated content immediately
 *   - Stores a history record with the generated content + send results
 *   - When generation yields nothing, retries next run — up to
 *     GENERATOR_MAX_ATTEMPTS total, then the occurrence is skipped
 *     (recurring) or the campaign is marked failed (one-off)
 *
 * Recurring campaigns (has `recurrence` field):
 *   - Creates a history doc in the same collection with results
 *   - Advances the recurring doc's sendAt to the next FUTURE occurrence
 *     (missed occurrences are skipped — no catch-up bursts)
 *   - Status returns to 'pending' on the recurring doc
 *
 * Unknown campaign types / generators are marked 'failed' (they can never
 * succeed — usually a config typo — so retrying forever just burns runs).
 *
 * Runs on bm_cronFrequent (every 10 minutes).
 */
const moment = require('moment');
const pushid = require('pushid');
const notification = require('../../../libraries/notification.js');
const { getNextFutureOccurrence } = require('../../../libraries/email/constants.js');

// How long a 'processing' lease is honored before the campaign of a crashed or
// timed-out run is reclaimed for retry. Must comfortably exceed the function
// timeout so an in-flight run is never reclaimed out from under itself.
const PROCESSING_LEASE_SECONDS = 30 * 60;

// How many times a generator campaign may yield nothing before its occurrence
// is skipped (recurring) or the campaign is failed (one-off). At the 10-minute
// cron cadence this is ~6 hours of retries.
const GENERATOR_MAX_ATTEMPTS = 36;

module.exports = async ({ Manager, assistant, libraries }) => {
  const { admin } = libraries;
  const now = Math.round(Date.now() / 1000);
  const collection = admin.firestore().collection('marketing-campaigns');

  // --- Reclaim stale processing leases (crashed or timed-out runs) ---
  // Single-equality query + in-memory cutoff — no composite index required.
  const processingSnapshot = await collection
    .where('status', '==', 'processing')
    .limit(50)
    .get();

  for (const doc of processingSnapshot.docs) {
    const startedAt = doc.data().processingStartedAt || 0;

    if (startedAt > now - PROCESSING_LEASE_SECONDS) {
      continue;
    }

    await doc.ref.set({
      status: 'pending',
      metadata: { updated: stamp() },
    }, { merge: true });

    assistant.log(`Reclaimed stale processing lease on ${doc.id} (started ${moment.unix(startedAt).toISOString()})`);
  }

  // --- Query campaigns that are ready to send ---
  const snapshot = await collection
    .where('status', '==', 'pending')
    .where('sendAt', '<=', now)
    .limit(20)
    .get();

  if (snapshot.empty) {
    assistant.log('No pending campaigns ready to send');
    return;
  }

  assistant.log(`Processing ${snapshot.size} campaign(s)...`);

  const email = Manager.Email(assistant);

  const results = await Promise.allSettled(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const { settings, type, recurrence, generator } = data;
    const campaignId = doc.id;

    // Claim the campaign before doing ANY work. If another (overlapping) run
    // already claimed it, skip — this is what makes double-sends impossible.
    const claimed = await claimCampaign(admin, doc, now);

    if (!claimed) {
      assistant.log(`Campaign ${campaignId} already claimed by another run, skipping`);
      return;
    }

    assistant.log(`Processing campaign ${campaignId} (${type}): ${settings.name}`);

    // --- Generator campaigns: generate content + send in one shot ---
    if (generator) {
      const generators = {
        newsletter: require('../../../libraries/email/generators/newsletter.js'),
      };

      if (!generators[generator]) {
        await doc.ref.set({
          status: 'failed',
          error: `Unknown generator "${generator}"`,
          metadata: { updated: stamp() },
        }, { merge: true });

        assistant.log(`Unknown generator "${generator}" on ${campaignId} — marked failed`);
        return;
      }

      assistant.log(`Running generator "${generator}" for ${campaignId}...`);

      const generatedId = pushid();
      const generated = await generators[generator].generate(Manager, assistant, settings, {
        campaignId: generatedId,
        imageHost: 'github',
        publishArticle: Manager.isProduction(),
      });

      // Nothing generated (no sources, filter dropped everything, disabled in
      // test mode, ...). Retry next run — up to the attempts cap.
      if (!generated) {
        const attempts = (data.generatorAttempts || 0) + 1;

        if (attempts >= GENERATOR_MAX_ATTEMPTS) {
          if (recurrence) {
            const nextSendAt = getNextFutureOccurrence(data.sendAt, recurrence, now);

            await doc.ref.set({
              status: 'pending',
              sendAt: nextSendAt,
              generatorAttempts: admin.firestore.FieldValue.delete(),
              metadata: { updated: stamp() },
            }, { merge: true });

            assistant.log(`Generator "${generator}" yielded nothing ${attempts}x on ${campaignId} — skipping to next occurrence: ${moment.unix(nextSendAt).toISOString()}`);
          } else {
            await doc.ref.set({
              status: 'failed',
              error: `Generator "${generator}" yielded no content after ${attempts} attempts`,
              metadata: { updated: stamp() },
            }, { merge: true });

            assistant.log(`Generator "${generator}" yielded nothing ${attempts}x on one-off ${campaignId} — marked failed`);
          }

          return;
        }

        await doc.ref.set({
          status: 'pending',
          generatorAttempts: attempts,
          metadata: { updated: stamp() },
        }, { merge: true });

        assistant.log(`Generator "${generator}" returned no content for ${campaignId}, will retry next run (attempt ${attempts}/${GENERATOR_MAX_ATTEMPTS})`);
        return;
      }

      // Strip generation byproducts: bulky debug/asset fields stay OUT of the
      // send payload and the history doc's settings (article carries the full
      // post body; assets/meta are stored as their own fields below).
      const {
        images: _images,
        mjml: _mjml,
        structure: _structure,
        contentMarkdown: _contentMarkdown,
        article: _article,
        assets,
        meta,
        ...generatedSettings
      } = generated;

      assistant.log(`Generated content for ${campaignId}: "${generated.subject}"`);

      // Send immediately
      const campaignResults = await email.sendCampaign({ ...generatedSettings, sendAt: 'now' });
      const success = Object.values(campaignResults).some(r => r.success || r.sent > 0);

      // Store history record
      const historyId = pushid();
      await admin.firestore().doc(`marketing-campaigns/${historyId}`).set({
        settings: generatedSettings,
        assets: assets || null,
        meta: meta || null,
        type,
        sendAt: data.sendAt,
        status: success ? 'sent' : 'failed',
        results: campaignResults,
        generatedFrom: campaignId,
        metadata: { created: stamp(), updated: stamp() },
      });

      if (recurrence) {
        // Advance sendAt to the next FUTURE occurrence
        const nextSendAt = getNextFutureOccurrence(data.sendAt, recurrence, now);

        await doc.ref.set({
          status: 'pending',
          sendAt: nextSendAt,
          generatorAttempts: admin.firestore.FieldValue.delete(),
          metadata: { updated: stamp() },
        }, { merge: true });

        assistant.log(`${success ? 'Sent' : 'Failed'} generator campaign ${campaignId}, next: ${moment.unix(nextSendAt).toISOString()}`);
      } else {
        // One-off: finalize so it is never picked up again
        await doc.ref.set({
          status: success ? 'sent' : 'failed',
          results: campaignResults,
          generatorAttempts: admin.firestore.FieldValue.delete(),
          metadata: { updated: stamp() },
        }, { merge: true });

        assistant.log(`${success ? 'Sent' : 'Failed'} generator campaign ${campaignId} (one-off)`);
      }

      return;
    }

    // --- Dispatch by type ---
    let campaignResults;

    if (type === 'email') {
      campaignResults = await email.sendCampaign({ ...settings, sendAt: 'now' });
    } else if (type === 'push') {
      const pushFilters = settings.test
        ? { owner: settings._testUid || null, ...settings.filters }
        : (settings.filters || {});

      campaignResults = {
        push: await notification.send(assistant, {
          title: settings.name,
          body: settings.subject || settings.body,
          icon: settings.icon || Manager.config.brand?.images?.brandmark,
          clickAction: settings.clickAction || Manager.config.brand?.url,
          filters: pushFilters,
        }),
      };
    } else {
      await doc.ref.set({
        status: 'failed',
        error: `Unknown campaign type "${type}"`,
        metadata: { updated: stamp() },
      }, { merge: true });

      assistant.log(`Unknown campaign type "${type}" on ${campaignId} — marked failed`);
      return;
    }

    const success = Object.values(campaignResults).some(r => r.success || r.sent > 0);

    // --- Handle recurring vs one-off ---
    if (recurrence) {
      // Create history record
      const historyId = pushid();

      await admin.firestore().doc(`marketing-campaigns/${historyId}`).set({
        settings,
        type,
        sendAt: data.sendAt,
        status: success ? 'sent' : 'failed',
        results: campaignResults,
        recurringId: campaignId,
        metadata: { created: stamp(), updated: stamp() },
      });

      // Advance sendAt to the next FUTURE occurrence
      const nextSendAt = getNextFutureOccurrence(data.sendAt, recurrence, now);

      await doc.ref.set({
        status: 'pending',
        sendAt: nextSendAt,
        metadata: { updated: stamp() },
      }, { merge: true });

      assistant.log(`Recurring campaign ${campaignId} ${success ? 'sent' : 'failed'}, next: ${moment.unix(nextSendAt).toISOString()}`);
    } else {
      // One-off: update status directly
      await doc.ref.set({
        status: success ? 'sent' : 'failed',
        results: campaignResults,
        metadata: { updated: stamp() },
      }, { merge: true });

      assistant.log(`Campaign ${campaignId} ${success ? 'sent' : 'failed'}`);
    }
  }));

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  for (const r of results) {
    if (r.status === 'rejected') {
      // The campaign doc stays 'processing' — the stale-lease reclaim retries
      // it after PROCESSING_LEASE_SECONDS instead of every 10 minutes.
      assistant.error(`Failed to process campaign: ${r.reason?.message}`, r.reason);
    }
  }

  assistant.log(`Completed! (${sent} processed, ${failed} failed)`);
};

/**
 * Transactionally claim a pending campaign by flipping status to 'processing'.
 * Returns false when another run (or an earlier claim) got there first.
 */
function claimCampaign(admin, doc, now) {
  return admin.firestore().runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);

    if (!fresh.exists || fresh.data().status !== 'pending') {
      return false;
    }

    tx.set(doc.ref, {
      status: 'processing',
      processingStartedAt: now,
      metadata: { updated: stamp() },
    }, { merge: true });

    return true;
  });
}

function stamp() {
  return {
    timestamp: new Date().toISOString(),
    timestampUNIX: Math.round(Date.now() / 1000),
  };
}

// Exposed for tests (test/email/campaign-cron-pipeline.js) — single source of
// truth for the lease + retry-cap tuning.
module.exports.PROCESSING_LEASE_SECONDS = PROCESSING_LEASE_SECONDS;
module.exports.GENERATOR_MAX_ATTEMPTS = GENERATOR_MAX_ATTEMPTS;
