/**
 * Marketing campaigns cron job
 *
 * Picks up campaigns from the `marketing-campaigns` collection that are
 * past their sendAt time and still pending. Dispatches based on type:
 *   - email: fires through mailer.sendCampaign()
 *   - push: fires through notification.send()
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
const notification = require('../../libraries/notification.js');

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
    const { settings, type, recurrence } = data;
    const campaignId = doc.id;

    assistant.log(`Processing campaign ${campaignId} (${type}): ${settings.name}`);

    // --- Dispatch by type ---
    let campaignResults;

    if (type === 'email') {
      campaignResults = await email.sendCampaign({ ...settings, sendAt: 'now' });
    } else if (type === 'push') {
      campaignResults = {
        push: await notification.send(assistant, {
          title: settings.name,
          body: settings.subject || settings.body,
          icon: settings.icon,
          clickAction: settings.clickAction,
          filters: settings.filters,
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

/**
 * Calculate the next occurrence unix timestamp from the current sendAt.
 *
 * @param {number} currentSendAt - Current fire time (unix)
 * @param {object} recurrence - { pattern, hour, day, month }
 * @returns {number} Next fire time (unix)
 */
function getNextOccurrence(currentSendAt, recurrence) {
  const current = moment.unix(currentSendAt);
  const { pattern } = recurrence;

  switch (pattern) {
    case 'daily':
      return current.add(1, 'day').unix();

    case 'weekly':
      return current.add(1, 'week').unix();

    case 'monthly':
      return current.add(1, 'month').unix();

    case 'quarterly':
      return current.add(3, 'months').unix();

    case 'yearly':
      return current.add(1, 'year').unix();

    default:
      // Fallback: 1 month
      return current.add(1, 'month').unix();
  }
}
