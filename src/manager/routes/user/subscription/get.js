const powertools = require('node-powertools');

/**
 * GET /user/subscription - Get user subscription info
 * Returns plan, expiry, trial, and payment status
 */
module.exports = async ({ assistant, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID
  const uid = settings.uid;

  // Require admin to view other users' subscriptions
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Get user data
  let userData = user;

  if (uid !== user.auth.uid) {
    const doc = await admin.firestore().doc(`users/${uid}`).get();

    if (!doc.exists) {
      return assistant.respond('User not found', { code: 404 });
    }

    userData = doc.data();
  }

  // Build response
  const oldDate = powertools.timestamp(new Date(0), { output: 'string' });
  const oldDateUNIX = powertools.timestamp(oldDate, { output: 'unix' });

  const result = {
    plan: {
      id: userData?.plan?.id || 'unknown',
      expires: {
        timestamp: userData?.plan?.expires?.timestamp || oldDate,
        timestampUNIX: userData?.plan?.expires?.timestampUNIX || oldDateUNIX,
      },
      trial: {
        activated: userData?.plan?.trial?.activated ?? false,
        date: {
          timestamp: userData?.plan?.trial?.date?.timestamp || oldDate,
          timestampUNIX: userData?.plan?.trial?.date?.timestampUNIX || oldDateUNIX,
        },
      },
      payment: {
        active: userData?.plan?.payment?.active ?? false,
      },
    },
  };

  return assistant.respond(result);
};
