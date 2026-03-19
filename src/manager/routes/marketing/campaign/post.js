/**
 * POST /marketing/campaign - Create a marketing campaign
 * Admin-only. Saves to marketing-campaigns collection.
 *
 * - sendAt defaults to 'now' (immediate send)
 * - Future sendAt → saved as 'pending' for cron pickup
 * - Past/now sendAt → fires immediately, saved as 'sent'/'failed'
 * - Supports type: 'email' (default) or 'push' (future)
 *
 * Content is markdown — converted to HTML at send time per provider.
 */
const pushid = require('pushid');
const { buildCampaignDoc } = require('./utils');

module.exports = async ({ assistant, user, Manager, settings, analytics }) => {

  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }
  if (!user.roles.admin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  const { admin } = Manager.libraries;
  const campaignId = settings.id || pushid();
  const { docFields, campaignSettings, now } = buildCampaignDoc(settings);

  const isFuture = docFields.sendAt > now.unix();

  const doc = {
    ...docFields,
    settings: campaignSettings,
    status: 'pending',
    metadata: {
      created: {
        timestamp: now.toISOString(),
        timestampUNIX: now.unix(),
      },
      updated: {
        timestamp: now.toISOString(),
        timestampUNIX: now.unix(),
      },
    },
  };

  // Save to Firestore
  await admin.firestore().doc(`marketing-campaigns/${campaignId}`).set(doc);

  assistant.log('marketing/campaign created:', { campaignId, sendAt: docFields.sendAt, isFuture, type: docFields.type });

  // If sendAt is now/past, fire immediately
  let results = null;

  if (!isFuture && docFields.type === 'email') {
    const mailer = Manager.Email(assistant);
    results = await mailer.sendCampaign({ ...campaignSettings, sendAt: 'now' });

    // Update status
    const status = Object.values(results).some(r => r.success) ? 'sent' : 'failed';

    await admin.firestore().doc(`marketing-campaigns/${campaignId}`).set({
      status,
      results,
      metadata: {
        updated: {
          timestamp: new Date().toISOString(),
          timestampUNIX: Math.round(Date.now() / 1000),
        },
      },
    }, { merge: true });

    assistant.log('marketing/campaign sent:', { campaignId, status, results });
  }

  // Analytics
  analytics.event('marketing/campaign', {
    action: isFuture ? 'schedule' : 'send',
    type: docFields.type,
  });

  return assistant.respond({
    success: true,
    id: campaignId,
    status: isFuture ? 'pending' : (results ? 'sent' : 'pending'),
    sendAt: docFields.sendAt,
    providers: results,
  });
};
