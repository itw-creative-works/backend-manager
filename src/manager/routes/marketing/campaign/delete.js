/**
 * DELETE /marketing/campaign - Delete a marketing campaign
 * Admin-only. Can only delete pending campaigns.
 */
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

  const docRef = admin.firestore().doc(`marketing-campaigns/${campaignId}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return assistant.respond('Campaign not found', { code: 404 });
  }

  const existing = doc.data();

  // Can only delete pending campaigns (sent/failed are historical records)
  if (existing.status !== 'pending') {
    return assistant.respond(`Cannot delete campaign with status "${existing.status}"`, { code: 400 });
  }

  await docRef.delete();

  assistant.log('marketing/campaign deleted:', { campaignId });

  analytics.event('marketing/campaign', { action: 'delete' });

  return assistant.respond({
    success: true,
    deleted: campaignId,
  });
};
