/**
 * PUT /marketing/campaign - Update a marketing campaign
 * Admin-only. Used by calendar frontend for edits and rescheduling.
 *
 * Accepts any field from the POST schema. Only provided fields are updated.
 * Changing sendAt reschedules the campaign (if still pending).
 */
const _ = require('lodash');
const moment = require('moment');

module.exports = async ({ assistant, user, Manager, settings, analytics }) => {

  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }
  if (!user.roles.admin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  const { admin } = Manager.libraries;
  const campaignId = (settings.id || '').trim();

  if (!campaignId) {
    return assistant.respond('Campaign ID is required', { code: 400 });
  }

  // Fetch existing
  const docRef = admin.firestore().doc(`marketing-campaigns/${campaignId}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return assistant.respond('Campaign not found', { code: 404 });
  }

  const existing = doc.data();

  // Can only edit pending campaigns
  if (existing.status !== 'pending') {
    return assistant.respond(`Cannot edit campaign with status "${existing.status}"`, { code: 400 });
  }

  // Build update — merge provided fields into existing settings
  const update = {
    metadata: {
      updated: {
        timestamp: new Date().toISOString(),
        timestampUNIX: Math.round(Date.now() / 1000),
      },
    },
  };

  // Update sendAt if provided
  if (settings.sendAt !== undefined && settings.sendAt !== '') {
    update.sendAt = normalizeSendAt(settings.sendAt);
  }

  // Update type if provided
  if (settings.type) {
    update.type = settings.type;
  }

  // Update recurrence if provided
  if (settings.recurrence !== undefined) {
    update.recurrence = settings.recurrence;
  }

  // Update settings fields — only merge what's provided
  const settingsUpdate = {};
  const settingsFields = [
    'name', 'subject', 'preheader', 'template', 'content', 'data',
    'lists', 'segments', 'excludeSegments', 'all',
    'utm', 'sender', 'providers', 'group', 'categories',
  ];

  for (const field of settingsFields) {
    if (settings[field] !== undefined && settings[field] !== '') {
      settingsUpdate[field] = settings[field];
    }
  }

  if (Object.keys(settingsUpdate).length) {
    // Clean undefined values for Firestore
    const cleaned = _.cloneDeepWith(settingsUpdate, (value) => {
      if (typeof value === 'undefined') {
        return null;
      }
    });

    update.settings = { ...existing.settings, ...cleaned };
  }

  await docRef.set(update, { merge: true });

  assistant.log('marketing/campaign updated:', { campaignId, update });

  analytics.event('marketing/campaign', { action: 'update' });

  // Fetch updated doc
  const updated = await docRef.get();

  return assistant.respond({
    success: true,
    campaign: { id: campaignId, ...updated.data() },
  });
};

function normalizeSendAt(sendAt) {
  if (!sendAt || sendAt === 'now') {
    return Math.round(Date.now() / 1000);
  }

  if (typeof sendAt === 'number') {
    return sendAt;
  }

  if (/^\d+$/.test(sendAt)) {
    return parseInt(sendAt, 10);
  }

  const parsed = moment(sendAt);
  return parsed.isValid() ? parsed.unix() : Math.round(Date.now() / 1000);
}
