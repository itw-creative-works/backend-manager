let _;

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Load libraries
    _ = Manager.require('lodash');

    // Set defaults
    payload.data.payload.update = payload.data.payload.update || false;

    // Perform checks
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    }

    // Get stats ref
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);

    // Get stats
    await stats
      .get()
      .then(async (doc) => {
        let data = doc.data() || {};

        // Ensure document exists with initial values (doesn't overwrite existing data)
        if (!doc.exists) {
          await stats.set({
            users: { total: 0 },
            app: Manager.config?.app?.id || null,
          });
          data = { users: { total: 0 } };
        }

        // Only update if requested
        if (payload.data.payload.update) {
          await self.updateStats(data, payload.data.payload.update)
            .catch(e => data = e)
        }

        // Reject if error
        if (data instanceof Error) {
          return reject(assistant.errorify(data, {code: 500}));
        }

        // Retrieve the stats again after updating
        await stats
          .get()
          .then(doc => {
            data = doc.data() || {};
          })
          .catch(e => data = e)


        // Reject if error
        if (data instanceof Error) {
          return reject(assistant.errorify(data, {code: 500}));
        }

        // Return
        return resolve({data: data})
      })
      .catch((e) => {
        return reject(assistant.errorify(`Failed to get: ${e}`, {code: 500}));
      })
  });

};

Module.prototype.fixStats = function (data) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);

    return resolve();
  });
}

// TODO: ADD https://firebase.google.com/docs/firestore/query-data/aggregation-queries#pricing
Module.prototype.updateStats = function (existingData, update) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    // Get refs
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);
    const gatheringOnline = self.libraries.admin.database().ref(`gatherings/online`);
    const sessionsApp = self.libraries.admin.database().ref(`sessions/app`);
    const sessionsOnline = self.libraries.admin.database().ref(`sessions/online`);

    // Set defaults
    let error = null;
    let newData = {
      app: self.Manager.config?.app?.id || null,
    };

    // Log
    self.assistant.log(`updateStats(): Starting...`);

    // Fetch new notification stats
    if (
      update === true || update?.notifications
    ) {
      await self.getAllNotifications()
        .then(r => {
          _.set(newData, 'notifications.total', r)
        })
        .catch(e => {
          error = new Error(`Failed getting notifications: ${e}`);
        })
    }

    // Fetch new subscription stats
    if (
      update === true || update?.subscriptions
    ) {
      await self.getAllSubscriptions()
        .then(r => {
          _.set(newData, 'subscriptions', r)
        })
        .catch(e => {
          error = new Error(`Failed getting subscriptions: ${e}`);
        })
    }

    // Fix user stats
    if (
      !existingData?.users?.total
      || update === true
      || update?.users
    ) {
      await self.getAllUsers()
        .then(r => {
          _.set(newData, 'users.total', r.length)
        })
        .catch(e => {
          error = new Error(`Failed fixing stats: ${e}`);
        })
    }

    // Reject if error
    if (error) {
      return reject(error);
    }

    const _countUsersOnline = async (app) => {
      await app
        .once('value')
        .then((snap) => {
          const data = snap.val() || {};
          const keys = Object.keys(data);
          const existing = newData?.users?.online || 0;

          // Set new value
          _.set(newData, 'users.online', existing + keys.length);
        })
        .catch(e => {
          error = new Error(`Failed getting online users: ${e}`);
        })
    }

    // Fetch new user stats
    if (
      update === true || update?.online
    ) {
      // Count users online (in old gathering)
      await _countUsersOnline(gatheringOnline);

      // Count users online (in new session)
      await _countUsersOnline(sessionsApp);

      // Count users online (in new session)
      await _countUsersOnline(sessionsOnline);
    }

    // Reject if error
    if (error) {
      return reject(error);
    }

    // Set metadata
    newData.metadata = self.Manager.Metadata().set({tag: 'admin:get-stats'})

    // Log
    self.assistant.log(`updateStats(): newData`, newData);

    // newData stats
    await stats
      .set(newData, { merge: true })
      .catch((e) => {
        return reject(new Error(`Failed getting stats: ${e}`));
      })

    // Return
    return resolve();
  });
}

Module.prototype.getAllUsers = function () {
  const self = this;
  return new Promise(async function(resolve, reject) {
    // Set initial users
    self.users = [];

    // Log
    self.assistant.log(`getAllUsers(): Starting...`);

    // Get users
    await getUsersBatch(self)
    .catch(e => {
      return reject(e);
    })

    // Log
    self.assistant.log(`getAllUsers(): Completed with ${self.users.length} users`);

    // Return
    return resolve(self.users);
  });
}

Module.prototype.getAllNotifications = function () {
  const self = this;
  return new Promise(async function(resolve, reject) {

    // Log
    self.assistant.log(`getAllNotifications(): Starting...`);

    // Get notifications
    await self.libraries.admin.firestore().collection('notifications')
    .count()
    .get()
    .then((snap) => {
      // Set count
      const count = snap.data().count;

      // Log
      self.assistant.log(`getAllNotifications(): Completed with ${count} notifications`);

      // Return
      return resolve(count);
    })
    .catch((e) => {
      return reject(e)
    });
  });
}

Module.prototype.getAllSubscriptions = function () {
  const self = this;
  return new Promise(async function(resolve, reject) {
    // Log
    self.assistant.log(`getAllSubscriptions(): Starting...`);

    // Get subscriptions
    await self.libraries.admin.firestore().collection('users')
    .where('plan.expires.timestampUNIX', '>=', new Date().getTime() / 1000)
    .get()
    .then((snapshot) => {
      const stats = {
        totals: {
          total: 0,
          exempt: 0,
        },
        plans: {}
      };

      // Loop through
      snapshot
      .forEach((doc, i) => {
        const data = doc.data();
        const planId = data?.plan?.id || 'basic';
        const frequency = data?.plan?.payment?.frequency || 'unknown';
        const isAdmin = data?.roles?.admin || false;
        const isVip = data?.roles?.vip || false;

        // Set initial plan
        if (!stats.plans[planId]) {
          stats.plans[planId] = {
            total: 0,
            monthly: 0,
            annually: 0,
            exempt: 0,
          }
        }

        // Increment exempt
        if (isAdmin || isVip) {
          stats.totals.exempt++;
          stats.plans[planId].exempt++;
          return
        }

        // Increment
        stats.totals.total++;
        stats.plans[planId].total++;
        stats.plans[planId][frequency] = (stats.plans[planId][frequency] || 0) + 1
      });

      // Log
      self.assistant.log(`getAllSubscriptions(): Completed with ${stats.totals.total} subscriptions`, stats);

      // Return
      return resolve(stats);
    })
    .catch((e) => {
      return reject(e)
    });

  });
}

function getUsersBatch(self, nextPageToken) {
  return new Promise(async function(resolve, reject) {
    // Log
    self.assistant.log(`getUsersBatch(): Starting...`);

    // Get users
    self.libraries.admin.auth().listUsers(1000, nextPageToken)
      .then((listUsersResult) => {
        // Concat users
        self.users = self.users.concat(listUsersResult.users);

        // Log
        self.assistant.log(`getUsersBatch(): Completed with ${self.users.length} users`);

        // Quit if no more users
        if (!listUsersResult.pageToken) {
          return resolve(listUsersResult.users);
        }

        // List next batch of users
        getUsersBatch(self, listUsersResult.pageToken)
          .then(() => {
            return resolve(listUsersResult.users);
          })
          .catch((e) => {
            return reject(e);
          })
      })
      .catch((e) => {
        return reject(e);
      });
  });
}

module.exports = Module;
