const { FieldValue } = require('firebase-admin/firestore');
const {
  buildContext,
} = require('./_helpers.js');

/**
 * DELETE /user/oauth2 - Remove OAuth connection
 *
 * Revokes tokens with the provider (best effort) and removes the connection.
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const context = await buildContext({ assistant, Manager, user, settings, libraries });

  if (context.error) {
    return assistant.respond(context.error.message, { code: context.error.code });
  }

  const { admin, oauth2Provider, targetUid, targetUser, clientId, clientSecret } = context;

  assistant.log('OAuth2 DELETE request', { provider: settings.provider });

  // Get current access token to revoke
  const accessToken = targetUser?.oauth2?.[settings.provider]?.token?.access_token;

  // Attempt to revoke token with provider (best effort)
  if (accessToken && oauth2Provider.revokeToken) {
    const revokeResult = await oauth2Provider.revokeToken(accessToken, {
      assistant,
      clientId,
      clientSecret,
    }).catch(e => ({ revoked: false, reason: e.message }));

    assistant.log('Token revocation result:', revokeResult);
  }

  // Delete OAuth data from user document
  await admin.firestore().doc(`users/${targetUid}`).update({
    [`oauth2.${settings.provider}`]: FieldValue.delete(),
    metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
  });

  return assistant.respond({ success: true });
};
