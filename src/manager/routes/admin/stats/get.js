const _ = require('lodash');

/**
 * GET /admin/stats - Get application stats
 * Admin-only endpoint to retrieve and optionally update app statistics
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  const stats = admin.firestore().doc('meta/stats');

  // Get current stats
  let doc = await stats.get().catch((e) => e);

  if (doc instanceof Error) {
    return assistant.respond(`Failed to get stats: ${doc.message}`, { code: 500 });
  }

  let data = doc.data() || {};

  // Ensure document exists with initial values
  if (!doc.exists) {
    await stats.set({
      users: { total: 0 },
      app: Manager.config?.app?.id || null,
    });
    data = { users: { total: 0 } };
  }

  // Update stats if requested
  if (settings.update) {
    const error = await updateStats(admin, assistant, Manager, data, settings.update);

    if (error) {
      return assistant.respond(error.message, { code: 500 });
    }

    // Retrieve stats again after updating
    doc = await stats.get().catch((e) => e);

    if (doc instanceof Error) {
      return assistant.respond(`Failed to get stats: ${doc.message}`, { code: 500 });
    }

    data = doc.data() || {};
  }

  return assistant.respond(data);
};

async function updateStats(admin, assistant, Manager, existingData, update) {
  const stats = admin.firestore().doc('meta/stats');
  const newData = {
    app: Manager.config?.app?.id || null,
  };

  assistant.log('updateStats(): Starting...');

  let error = null;

  // Update notification stats
  if (update === true || update?.notifications) {
    const count = await getAllNotifications(admin, assistant).catch((e) => e);

    if (count instanceof Error) {
      error = new Error(`Failed getting notifications: ${count.message}`);
    } else {
      _.set(newData, 'notifications.total', count);
    }
  }

  // Update subscription stats
  if (!error && (update === true || update?.subscriptions)) {
    const subscriptions = await getAllSubscriptions(admin, assistant).catch((e) => e);

    if (subscriptions instanceof Error) {
      error = new Error(`Failed getting subscriptions: ${subscriptions.message}`);
    } else {
      _.set(newData, 'subscriptions', subscriptions);
    }
  }

  // Update user stats
  if (!error && (!existingData?.users?.total || update === true || update?.users)) {
    const users = await getAllUsers(admin, assistant).catch((e) => e);

    if (users instanceof Error) {
      error = new Error(`Failed getting users: ${users.message}`);
    } else {
      _.set(newData, 'users.total', users.length);
    }
  }

  // Update online users
  if (!error && (update === true || update?.online)) {
    const online = await countOnlineUsers(admin, assistant);

    _.set(newData, 'users.online', online);
  }

  if (error) {
    return error;
  }

  // Set metadata
  newData.metadata = Manager.Metadata().set({ tag: 'admin/stats' });

  assistant.log('updateStats(): newData', newData);

  // Save stats
  await stats.set(newData, { merge: true }).catch((e) => {
    error = new Error(`Failed saving stats: ${e.message}`);
  });

  return error;
}

async function getAllUsers(admin, assistant) {
  assistant.log('getAllUsers(): Starting...');

  const users = [];
  let nextPageToken;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  assistant.log(`getAllUsers(): Completed with ${users.length} users`);

  return users;
}

async function getAllNotifications(admin, assistant) {
  assistant.log('getAllNotifications(): Starting...');

  const snap = await admin.firestore().collection('notifications').count().get();
  const count = snap.data().count;

  assistant.log(`getAllNotifications(): Completed with ${count} notifications`);

  return count;
}

async function getAllSubscriptions(admin, assistant) {
  assistant.log('getAllSubscriptions(): Starting...');

  const snapshot = await admin.firestore().collection('users')
    .where('plan.expires.timestampUNIX', '>=', Date.now() / 1000)
    .get();

  const stats = {
    totals: { total: 0, exempt: 0 },
    plans: {},
  };

  snapshot.forEach((doc) => {
    const data = doc.data();
    const planId = data?.plan?.id || 'basic';
    const frequency = data?.plan?.payment?.frequency || 'unknown';
    const isAdmin = data?.roles?.admin || false;
    const isVip = data?.roles?.vip || false;

    // Initialize plan
    if (!stats.plans[planId]) {
      stats.plans[planId] = { total: 0, monthly: 0, annually: 0, exempt: 0 };
    }

    // Count exempt users
    if (isAdmin || isVip) {
      stats.totals.exempt++;
      stats.plans[planId].exempt++;
      return;
    }

    // Count subscribers
    stats.totals.total++;
    stats.plans[planId].total++;
    stats.plans[planId][frequency] = (stats.plans[planId][frequency] || 0) + 1;
  });

  assistant.log(`getAllSubscriptions(): Completed with ${stats.totals.total} subscriptions`, stats);

  return stats;
}

async function countOnlineUsers(admin, assistant) {
  let online = 0;

  const paths = ['gatherings/online', 'sessions/app', 'sessions/online'];

  for (const path of paths) {
    const snap = await admin.database().ref(path).once('value').catch(() => null);

    if (snap) {
      const data = snap.val() || {};
      online += Object.keys(data).length;
    }
  }

  return online;
}
