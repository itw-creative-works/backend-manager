/**
 * Marketing campaigns cron job
 *
 * Picks up campaigns from the `marketing-campaigns` collection that are
 * past their sendAt time and still pending. Dispatches based on type:
 *   - email: fires through mailer.sendCampaign()
 *   - push: fires through notification.send()
 *
 * Generator campaigns (has `generator` field, e.g. 'newsletter'):
 *   - Runs the content generation pipeline (AI content, images, uploads)
 *   - Sends the generated content immediately
 *   - Stores a history record with the generated content + send results
 *   - Advances the recurring template's sendAt to the next occurrence
 *
 * Recurring campaigns (has `recurrence` field):
 *   - Creates a history doc in the same collection with results
 *   - Advances the recurring doc's sendAt to the next occurrence
 *   - Status stays 'pending' on the recurring doc
 *
 * Runs on bm_cronFrequent (every 10 minutes).
 */
const moment = require('moment');
const pushid = require('pushid');
const notification = require('../../../libraries/notification.js');
const { getNextOccurrence } = require('../../../libraries/email/constants.js');

module.exports = async ({ Manager, assistant, libraries }) => {
  const { admin } = libraries;
  const now = Math.round(Date.now() / 1000);

  // Query campaigns that are ready to send
  const snapshot = await admin.firestore()
    .collection('marketing-campaigns')
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
    let { settings, type, recurrence, generator } = data;
    const campaignId = doc.id;

    assistant.log(`Processing campaign ${campaignId} (${type}): ${settings.name}`);

    // --- Generator campaigns: generate content + send in one shot ---
    if (generator) {
      const generators = {
        newsletter: require('../../../libraries/email/generators/newsletter.js'),
      };

      if (!generators[generator]) {
        assistant.log(`Unknown generator "${generator}" on ${campaignId}, skipping`);
        return;
      }

      assistant.log(`Running generator "${generator}" for ${campaignId}...`);

      const generatedId = pushid();
      const generated = await generators[generator].generate(Manager, assistant, settings, {
        campaignId: generatedId,
        imageHost: 'github',
        publishArticle: Manager.isProduction(),
      });

      if (!generated) {
        assistant.log(`Generator "${generator}" returned no content for ${campaignId}, will retry next run`);
        return;
      }

      const {
        images: _images,
        mjml: _mjml,
        structure: _structure,
        contentMarkdown: _contentMarkdown,
        assets,
        meta,
        ...generatedSettings
      } = generated;

      assistant.log(`Generated content for ${campaignId}: "${generated.subject}"`);

      // Send immediately
      const campaignResults = await email.sendCampaign({ ...generatedSettings, sendAt: 'now' });
      const success = Object.values(campaignResults).some(r => r.success || r.sent > 0);

      const nowISO = new Date().toISOString();
      const nowUNIX = Math.round(Date.now() / 1000);

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
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      });

      // Advance sendAt to next occurrence
      if (recurrence) {
        const nextSendAt = getNextOccurrence(data.sendAt, recurrence);
        await doc.ref.set({
          sendAt: nextSendAt,
          metadata: {
            updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
          },
        }, { merge: true });
        assistant.log(`${success ? 'Sent' : 'Failed'} generator campaign ${campaignId}, next: ${moment.unix(nextSendAt).toISOString()}`);
      } else {
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
      assistant.log(`Unknown campaign type "${type}", skipping ${campaignId}`);
      return;
    }

    const success = Object.values(campaignResults).some(r => r.success || r.sent > 0);
    const nowISO = new Date().toISOString();
    const nowUNIX = Math.round(Date.now() / 1000);

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
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      });

      // Advance sendAt to next occurrence
      const nextSendAt = getNextOccurrence(data.sendAt, recurrence);

      await doc.ref.set({
        sendAt: nextSendAt,
        metadata: {
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      }, { merge: true });

      assistant.log(`Recurring campaign ${campaignId} ${success ? 'sent' : 'failed'}, next: ${moment.unix(nextSendAt).toISOString()}`);
    } else {
      // One-off: update status directly
      await doc.ref.set({
        status: success ? 'sent' : 'failed',
        results: campaignResults,
        metadata: {
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      }, { merge: true });

      assistant.log(`Campaign ${campaignId} ${success ? 'sent' : 'failed'}`);
    }
  }));

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  for (const r of results) {
    if (r.status === 'rejected') {
      assistant.error(`Failed to process campaign: ${r.reason?.message}`, r.reason);
    }
  }

  assistant.log(`Completed! (${sent} processed, ${failed} failed)`);
};
