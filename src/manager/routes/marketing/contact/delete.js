/**
 * DELETE /marketing/contact - Remove marketing contact
 * Admin-only endpoint to unsubscribe from newsletter
 *
 * Also mirrors consent.marketing.status = 'revoked' (source: 'admin') to the user doc
 * when the email maps to a user — otherwise the next sync (payment event, admin re-sync)
 * would re-add the contact the admin just removed.
 */

module.exports = async ({ assistant, Manager, settings, analytics }) => {

  // Initialize Usage to check auth level
  const usage = await Manager.Usage().init(assistant, {
    unauthenticatedMode: 'firestore',
  });
  const isAdmin = usage.user.roles?.admin;

  // Admin only endpoint
  if (!isAdmin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  // Extract parameters
  const email = (settings.email || '').trim().toLowerCase();

  // Validate email is provided
  if (!email) {
    return assistant.respond('Email is required', { code: 400 });
  }

  // Remove from providers
  const mailer = Manager.Email(assistant);
  const providerResults = await mailer.remove(email);

  // Mirror the removal to the user doc's consent so future syncs hit the email
  // library's consent gate instead of silently re-adding the contact
  // (best-effort, silent when the email maps to no user)
  await mirrorRevokedConsent({ assistant, Manager, email });

  // Log result
  assistant.log('marketing/contact delete result:', {
    email,
    providers: providerResults,
  });

  // Track analytics
  analytics.event('marketing/contact', { action: 'delete' });

  return assistant.respond({
    success: true,
    providers: providerResults,
  });
};

/**
 * Write consent.marketing.status = 'revoked' (source: 'admin') to the user doc that
 * matches the removed email. Same lookup + write shape as the marketing webhook
 * processors' revoke write. Silent when no user matches.
 */
async function mirrorRevokedConsent({ assistant, Manager, email }) {
  const { admin } = Manager.libraries;

  const snapshot = await admin.firestore().collection('users')
    .where('auth.email', '==', email)
    .limit(1)
    .get()
    .catch((e) => {
      assistant.error('marketing/contact delete: Failed to look up user by email:', e);
      return null;
    });

  if (!snapshot || snapshot.empty) {
    return; // Silent — email may not map to a current user
  }

  const uid = snapshot.docs[0].id;
  const timestamp = assistant.meta.startTime.timestamp;
  const timestampUNIX = assistant.meta.startTime.timestampUNIX;

  // Write consent.marketing.status = 'revoked' (preserve grantedAt — informational audit trail)
  await admin.firestore().doc(`users/${uid}`).set({
    consent: {
      marketing: {
        status: 'revoked',
        revokedAt: {
          timestamp,
          timestampUNIX,
          source: 'admin',
          ip: null,
          text: null,
        },
      },
    },
    metadata: Manager.Metadata().set({ tag: 'marketing/contact:delete' }),
  }, { merge: true })
    .then(() => {
      assistant.log(`marketing/contact delete: Mirrored revoked consent to user ${uid} (${email})`);
    })
    .catch((e) => {
      assistant.error(`marketing/contact delete: Failed to mirror revoked consent to ${uid}:`, e);
    });
}
