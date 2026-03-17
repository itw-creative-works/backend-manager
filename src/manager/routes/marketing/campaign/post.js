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
const _ = require('lodash');
const moment = require('moment');
const pushid = require('pushid');

module.exports = async ({ assistant, user, Manager, settings, analytics }) => {

  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }
  if (!user.roles.admin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  const { admin } = Manager.libraries;
  const campaignId = settings.id || pushid();
  const now = moment();

  // Normalize sendAt → unix timestamp
  const sendAt = normalizeSendAt(settings.sendAt, now);

  // Build the campaign document (settings nested, like emails-queue)
  const campaignSettings = {};

  // Required
  campaignSettings.name = settings.name;
  campaignSettings.subject = settings.subject;

  // Content
  if (settings.preheader) { campaignSettings.preheader = settings.preheader; }
  if (settings.template && settings.template !== 'default') { campaignSettings.template = settings.template; }
  if (settings.content) { campaignSettings.content = settings.content; }
  if (settings.data && Object.keys(settings.data).length) { campaignSettings.data = settings.data; }

  // Targeting
  if (settings.lists && settings.lists.length) { campaignSettings.lists = settings.lists; }
  if (settings.segments && settings.segments.length) { campaignSettings.segments = settings.segments; }
  if (settings.excludeSegments && settings.excludeSegments.length) { campaignSettings.excludeSegments = settings.excludeSegments; }
  if (settings.all) { campaignSettings.all = true; }

  // UTM
  if (settings.utm && Object.keys(settings.utm).length) { campaignSettings.utm = settings.utm; }

  // Config
  if (settings.sender) { campaignSettings.sender = settings.sender; }
  if (settings.providers && settings.providers.length) { campaignSettings.providers = settings.providers; }
  if (settings.group) { campaignSettings.group = settings.group; }
  if (settings.categories && settings.categories.length) { campaignSettings.categories = settings.categories; }

  // Clone and clean undefined values for Firestore
  const settingsCloned = _.cloneDeepWith(campaignSettings, (value) => {
    if (typeof value === 'undefined') {
      return null;
    }
  });

  const isFuture = sendAt > now.unix();
  const type = settings.type || 'email';

  const doc = {
    settings: settingsCloned,
    sendAt,
    status: 'pending',
    type,
    ...(settings.recurrence ? { recurrence: settings.recurrence } : {}),
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

  assistant.log('marketing/campaign created:', { campaignId, sendAt, isFuture, type });

  // If sendAt is now/past, fire immediately
  let results = null;

  if (!isFuture && type === 'email') {
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
    type,
  });

  return assistant.respond({
    success: true,
    id: campaignId,
    status: isFuture ? 'pending' : (results ? 'sent' : 'pending'),
    sendAt,
    providers: results,
  });
};

/**
 * Normalize sendAt to unix timestamp.
 * Accepts: 'now', ISO string, unix timestamp (number or string), undefined/empty.
 * Defaults to now.
 */
function normalizeSendAt(sendAt, now) {
  if (!sendAt || sendAt === 'now') {
    return now.unix();
  }

  // Unix timestamp (number)
  if (typeof sendAt === 'number') {
    return sendAt;
  }

  // Unix timestamp as string (all digits)
  if (/^\d+$/.test(sendAt)) {
    return parseInt(sendAt, 10);
  }

  // ISO string or other parseable date
  const parsed = moment(sendAt);

  if (parsed.isValid()) {
    return parsed.unix();
  }

  // Fallback to now
  return now.unix();
}
