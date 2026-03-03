const fetch = require('wonderful-fetch');

/**
 * DELETE /user - Delete user account
 * Requires admin auth or self-deletion with admin override
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID and reason
  const uid = settings.uid;
  const reason = (settings.reason || '').replace(/<[^>]*>/g, '').trim().substring(0, 500);

  // Require admin to delete other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Fetch user to check subscription status
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    return assistant.respond('User not found', { code: 404 });
  }

  const userData = userDoc.data();

  // Disallow deleting users with active or suspended paid subscriptions
  const subStatus = userData?.subscription?.status;
  const subId = userData?.subscription?.product?.id;
  if (
    (subStatus === 'active' || subStatus === 'suspended')
    && subId !== 'basic'
  ) {
    return assistant.respond(
      'This account cannot be deleted because it has a paid subscription attached to it. In order to delete the account, you must first cancel the paid subscription.',
      { code: 400 }
    );
  }

  // Sign out of all sessions first
  assistant.log(`Signing out of all sessions for ${uid}...`);

  await fetch(`${Manager.project.apiUrl}/backend-manager/user/sessions`, {
    method: 'delete',
    timeout: 30000,
    response: 'json',
    tries: 2,
    log: true,
    body: {
      uid,
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
    },
  })
    .then((json) => {
      assistant.log(`Sign out of all sessions success`, json);
    })
    .catch((e) => {
      assistant.error(`Sign out of all sessions failed`, e);
    });

  // Get the user's email before deleting (for confirmation email)
  const email = uid === user.auth.uid
    ? user.auth.email
    : await admin.auth().getUser(uid).then(r => r.email).catch(() => null);

  // Delete the user
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    return assistant.respond(`Failed to delete user: ${e}`, { code: 500 });
  }

  assistant.log(`Account deleted: ${uid}${reason ? `, reason: ${reason}` : ''}`);

  // Send confirmation email (fire-and-forget)
  const shouldSend = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;
  if (email && shouldSend) {
    sendConfirmationEmail(assistant, email, reason);
  }

  return assistant.respond({ success: true });
};

/**
 * Send account deletion confirmation email (fire-and-forget)
 */
function sendConfirmationEmail(assistant, email, reason) {
  const Manager = assistant.Manager;
  const brandName = Manager.config.brand.name;
  const mailer = Manager.Email(assistant);
  const reasonLine = reason
    ? `\n\n**Reason provided:** ${reason}`
    : '';

  mailer.send({
    to: email,
    categories: ['account/delete'],
    subject: `Your ${brandName} account has been deleted`,
    template: 'default',
    group: 'account',
    copy: true,
    data: {
      email: {
        preview: `Your ${brandName} account has been permanently deleted. All associated data has been removed.`,
      },
      body: {
        title: 'Account Deleted',
        message: `Your **${brandName}** account and all associated personal data have been permanently deleted from our systems. This action is irreversible.${reasonLine}

**What this means:**

- Your account credentials and profile information have been removed.
- Any pending data requests have been cancelled.
- Subscription and billing records have been deleted.
- You will no longer be able to sign in with this account.

If you did not request this deletion, please contact us immediately by replying to this email.

If you wish to use ${brandName} again in the future, you are welcome to create a new account at any time.`,
      },
    },
  })
    .then((result) => {
      assistant.log(`sendConfirmationEmail(): Success, status=${result.status}`);
    })
    .catch((e) => {
      assistant.error(`sendConfirmationEmail(): Failed: ${e.message}`);
    });
}
