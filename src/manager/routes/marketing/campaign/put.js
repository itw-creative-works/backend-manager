/**
 * PUT /marketing/campaign - Update a marketing campaign
 * Admin-only. Used by calendar frontend for edits and rescheduling.
 *
 * Accepts any field from the POST schema. Only provided fields are updated.
 * Changing sendAt reschedules the campaign (if still pending).
 */
const { buildCampaignDoc } = require('./utils');

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

  // Build update from provided fields using shared utility
  const { docFields, campaignSettings } = buildCampaignDoc(settings);

  const update = {
    ...docFields,
    metadata: {
      updated: {
        timestamp: new Date().toISOString(),
        timestampUNIX: Math.round(Date.now() / 1000),
      },
    },
  };

  // Merge provided settings into existing
  if (Object.keys(campaignSettings).length) {
    update.settings = { ...existing.settings, ...campaignSettings };
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
