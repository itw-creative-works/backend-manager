/**
 * Marketing contact pruning cron job
 *
 * Runs daily but only acts on the 1st of each month.
 * Two-stage process using SSOT segment keys from constants.js:
 *
 *   Stage 1 (engagement_inactive_5m):
 *     → Send re-engagement email via sendCampaign (brand-scoped internally)
 *     → Excludes engagement_inactive_6m (those get pruned instead)
 *
 *   Stage 2 (engagement_inactive_6m):
 *     → Create brand-scoped temp segment via createBrandScopedSegment
 *     → Export contacts, exclude paying customers, bulk delete
 *     → Log deleted emails to Firestore for recoverability
 *     → Remove from Beehiiv (same emails)
 *
 * Segment keys are resolved to provider-specific IDs at runtime.
 * Requires marketing.prune.enabled = true in backend-manager-config.json.
 *
 * Runs on bm_cronDaily.
 */
const sendgridProvider = require('../../../libraries/email/providers/sendgrid.js');

module.exports = async ({ Manager, assistant, libraries }) => {
  if (new Date().getDate() !== 1) {
    return;
  }

  if (Manager.config?.marketing?.prune?.enabled === false) {
    assistant.log('Marketing prune: disabled');
    return;
  }

  const brand = Manager.config?.brand;

  assistant.log(`Marketing prune: Starting monthly prune cycle for ${brand?.id || 'unknown'}`);

  // --- Stage 1: Re-engagement email ---
  try {
    await stageReengage(Manager, assistant);
  } catch (e) {
    assistant.error('Marketing prune: Stage 1 (re-engagement) failed:', e.message);
  }

  // --- Stage 2: Delete inactive contacts ---
  await stagePrune(Manager, assistant, libraries);

  assistant.log(`Marketing prune: Completed for ${brand?.id || 'unknown'}`);
};

/**
 * Stage 1: Send re-engagement email to contacts inactive 5+ months
 * (excluding 6+ months — those get pruned in stage 2).
 *
 * sendCampaign handles brand-scoping internally via _resolveAudience →
 * createBrandScopedSegment, so this stage is already brand-safe.
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
 * Stage 2: Delete contacts inactive 6+ months (brand-scoped).
 *
 * Uses createBrandScopedSegment to AND the engagement_inactive_6m query
 * with brand_id = '<brandId>' — each brand only prunes its own contacts.
 * Excludes paying customers (subscription_paid segment).
 * Logs deleted emails to Firestore for recoverability.
 */
async function stagePrune(Manager, assistant, libraries) {
  assistant.log('Marketing prune: Stage 2 — Prune');

  const marketing = Manager.config?.marketing || {};
  const brand = Manager.config?.brand;
  const { admin } = libraries;

  if (!brand?.id) {
    assistant.error('Marketing prune: brand.id is missing — aborting to prevent account-global deletion');
    return;
  }

  if (marketing.campaigns?.enabled === false || !process.env.SENDGRID_API_KEY) {
    assistant.log('Marketing prune: SendGrid not configured, skipping');
    return;
  }

  const segmentIdMap = await sendgridProvider.resolveSegmentIds();
  const pruneSegmentId = segmentIdMap['engagement_inactive_6m'];

  if (!pruneSegmentId) {
    assistant.error('Marketing prune: engagement_inactive_6m segment not found in SendGrid');
    return;
  }

  // Brand-scope the prune segment
  const tempPrune = await sendgridProvider.createBrandScopedSegment(
    [pruneSegmentId],
    brand.id,
  );

  if (!tempPrune) {
    assistant.error('Marketing prune: Failed to create brand-scoped prune segment');
    return;
  }

  try {
    const exportResult = await sendgridProvider.getSegmentContacts(tempPrune.segmentId, 180000);

    if (!exportResult.success) {
      assistant.error('Marketing prune: Failed to export segment:', exportResult.error);
      return;
    }

    if (exportResult.contacts.length === 0) {
      assistant.log('Marketing prune: No contacts to prune');
      return;
    }

    // Exclude paying customers
    let contactsToPrune = exportResult.contacts;
    let skippedPaid = 0;

    const paidSegmentId = segmentIdMap['subscription_paid'];

    if (paidSegmentId) {
      const tempPaid = await sendgridProvider.createBrandScopedSegment(
        [paidSegmentId],
        brand.id,
      );

      if (tempPaid) {
        try {
          const paidExport = await sendgridProvider.getSegmentContacts(tempPaid.segmentId, 180000);

          if (paidExport.success && paidExport.contacts.length > 0) {
            const paidEmails = new Set(paidExport.contacts.map(c => c.email));
            contactsToPrune = contactsToPrune.filter(c => !paidEmails.has(c.email));
            skippedPaid = exportResult.contacts.length - contactsToPrune.length;
            assistant.log(`Marketing prune: Excluded ${skippedPaid} paying customers`);
          }
        } finally {
          await tempPaid.cleanup();
        }
      }
    }

    if (contactsToPrune.length === 0) {
      assistant.log('Marketing prune: No contacts to prune after paid exclusion');
      return;
    }

    const emails = contactsToPrune.map(c => c.email).filter(Boolean);

    assistant.log(`Marketing prune: Deleting ${contactsToPrune.length} contacts for ${brand.id}`);

    // Delete from SendGrid
    const ids = contactsToPrune.map(c => c.id).filter(Boolean);
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

    assistant.log(`Marketing prune: Deleted ${totalDeleted} SendGrid contacts for ${brand.id}`);

    // Remove from Beehiiv (before Firestore log — a failed log shouldn't skip BH cleanup)
    if (marketing.newsletter?.enabled !== false && process.env.BEEHIIV_API_KEY) {
      const beehiivProvider = require('../../../libraries/email/providers/beehiiv.js');

      assistant.log(`Marketing prune: Removing ${emails.length} contacts from Beehiiv for ${brand.id}`);

      await Promise.allSettled(
        emails.map(email => beehiivProvider.removeContact(email))
      );
    }

    // Log to Firestore for recoverability (non-fatal — don't abort if write fails)
    try {
      const now = new Date();
      const logKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await admin.firestore()
        .doc(`marketing-prune-logs/${brand.id}/runs/${logKey}`)
        .set({
          brandId: brand.id,
          date: now.toISOString(),
          count: emails.length,
          emails,
          skippedPaid,
        });

      assistant.log(`Marketing prune: Logged ${emails.length} pruned emails to Firestore (${logKey})`);
    } catch (e) {
      assistant.error('Marketing prune: Failed to write Firestore log:', e.message);
    }
  } finally {
    await tempPrune.cleanup();
  }
}
