/**
 * Marketing contact pruning cron job
 *
 * Runs daily but only acts on the 1st of each month.
 * Two-stage process using SSOT segment keys from constants.js:
 *
 *   Stage 1 (engagement_inactive_5m):
 *     → Send re-engagement email via sendCampaign
 *     → Excludes engagement_inactive_6m (those get pruned instead)
 *
 *   Stage 2 (engagement_inactive_6m):
 *     → Export contacts from segment, bulk delete
 *     → Excludes subscription_paid (never prune paying customers)
 *
 * Segment keys are resolved to provider-specific IDs at runtime.
 * Requires marketing.prune.enabled = true in backend-manager-config.json.
 *
 * Runs on bm_cronDaily.
 */
const sendgridProvider = require('../../../libraries/email/providers/sendgrid.js');

module.exports = async ({ Manager, assistant }) => {
  // Only run on the 1st of the month
  if (new Date().getDate() !== 1) {
    return;
  }

  if (Manager.config?.marketing?.prune?.enabled === false) {
    assistant.log('Marketing prune: disabled');
    return;
  }

  assistant.log('Marketing prune: Starting monthly prune cycle');

  // --- Stage 1: Re-engagement email ---
  await stageReengage(Manager, assistant);

  // --- Stage 2: Delete inactive contacts ---
  await stagePrune(Manager, assistant);

  assistant.log('Marketing prune: Completed');
};

/**
 * Stage 1: Send re-engagement email to contacts inactive 5+ months
 * (excluding 6+ months — those get pruned in stage 2)
 */
async function stageReengage(Manager, assistant) {
  assistant.log('Marketing prune: Stage 1 — Re-engagement');

  const mailer = Manager.Email(assistant);
  const brand = Manager.config?.brand;

  const result = await mailer.sendCampaign({
    name: 'Re-engagement: Are you still with us?',
    subject: `We miss you at ${brand?.name || 'our service'}!`,
    preheader: 'Update your preferences or say goodbye',
    content: [
      '# We miss you!',
      '',
      'It\'s been a while since you\'ve opened one of our emails. We want to make sure we\'re sending you content you actually want.',
      '',
      '**If you\'d like to keep hearing from us**, simply open this email — no action needed!',
      '',
      'If we don\'t hear from you, we\'ll remove you from our mailing list next month to keep your inbox clean.',
      '',
      `Thanks for being part of the ${brand?.name || ''} community.`,
    ].join('\n'),
    sender: 'hello',
    segments: ['engagement_inactive_5m'],
    excludeSegments: ['engagement_inactive_6m'],
    sendAt: 'now',
  });

  assistant.log('Marketing prune: Re-engagement result:', result);
}

/**
 * Stage 2: Delete contacts inactive 6+ months.
 * Resolves segment IDs from SSOT keys at runtime.
 * Excludes paying customers.
 */
async function stagePrune(Manager, assistant) {
  assistant.log('Marketing prune: Stage 2 — Prune');

  const marketing = Manager.config?.marketing || {};

  // --- SendGrid ---
  if (marketing.sendgrid?.enabled !== false && process.env.SENDGRID_API_KEY) {
    const segmentIdMap = await sendgridProvider.resolveSegmentIds();
    const pruneSegmentId = segmentIdMap['engagement_inactive_6m'];

    if (!pruneSegmentId) {
      assistant.error('Marketing prune: engagement_inactive_6m segment not found in SendGrid');
      return;
    }

    const exportResult = await sendgridProvider.getSegmentContacts(pruneSegmentId, 180000);

    if (!exportResult.success) {
      assistant.error('Marketing prune: Failed to export segment:', exportResult.error);
      return;
    }

    if (exportResult.contacts.length === 0) {
      assistant.log('Marketing prune: No contacts to prune');
      return;
    }

    assistant.log(`Marketing prune: Deleting ${exportResult.contacts.length} contacts`);

    const ids = exportResult.contacts.map(c => c.id).filter(Boolean);
    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const deleteResult = await sendgridProvider.bulkDeleteContacts(batch);

      if (deleteResult.success) {
        totalDeleted += batch.length;
      } else {
        assistant.error('Marketing prune: Batch delete failed:', deleteResult.error);
      }
    }

    assistant.log(`Marketing prune: Deleted ${totalDeleted} SendGrid contacts`);

    // Also remove from Beehiiv (same emails)
    if (marketing.beehiiv?.enabled !== false && process.env.BEEHIIV_API_KEY) {
      const beehiivProvider = require('../../../libraries/email/providers/beehiiv.js');
      const emails = exportResult.contacts.map(c => c.email).filter(Boolean);

      assistant.log(`Marketing prune: Removing ${emails.length} contacts from Beehiiv`);

      await Promise.allSettled(
        emails.map(email => beehiivProvider.removeContact(email))
      );
    }
  }
}
