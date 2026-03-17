/**
 * GET /marketing/campaign - List or get marketing campaigns
 * Admin-only. Used by calendar frontend.
 *
 * Query params:
 *   id       — Get a single campaign by ID
 *   start    — Filter campaigns with sendAt >= start (unix timestamp)
 *   end      — Filter campaigns with sendAt <= end (unix timestamp)
 *   status   — Filter by status (pending, sent, failed)
 *   type     — Filter by type (email, push)
 *   limit    — Max results (default 100)
 */
module.exports = async ({ assistant, user, Manager, settings }) => {

  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }
  if (!user.roles.admin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  const { admin } = Manager.libraries;

  // Single campaign by ID
  if (settings.id) {
    const doc = await admin.firestore().doc(`marketing-campaigns/${settings.id}`).get();

    if (!doc.exists) {
      return assistant.respond('Campaign not found', { code: 404 });
    }

    return assistant.respond({
      success: true,
      campaign: { id: doc.id, ...doc.data() },
    });
  }

  // List campaigns with filters
  let query = admin.firestore().collection('marketing-campaigns');

  if (settings.status) {
    query = query.where('status', '==', settings.status);
  }
  if (settings.type) {
    query = query.where('type', '==', settings.type);
  }
  if (settings.start) {
    query = query.where('sendAt', '>=', parseInt(settings.start, 10));
  }
  if (settings.end) {
    query = query.where('sendAt', '<=', parseInt(settings.end, 10));
  }

  query = query.orderBy('sendAt', 'asc');
  query = query.limit(parseInt(settings.limit, 10) || 100);

  const snapshot = await query.get();

  const campaigns = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  return assistant.respond({
    success: true,
    campaigns,
    count: campaigns.length,
  });
};
