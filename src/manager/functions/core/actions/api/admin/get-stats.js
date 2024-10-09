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

    // Get stats
    const stats = self.libraries.admin.firestore().doc(`meta/stats`)
    await stats
      .get()
      .then(async (doc) => {
        let data = doc.data() || {};

        // Only update if requested
        if (payload.data.payload.update) {
          await self.updateStats(data, payload.data.payload.update)
            .catch(e => data = e)
        }

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


        if (data instanceof Error) {
          return reject(assistant.errorify(data, {code: 500}));
        }

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
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);
    const gatheringOnline = self.libraries.admin.database().ref(`gatherings/online`);
    const sessionsApp = self.libraries.admin.database().ref(`sessions/app`);
    const sessionsOnline = self.libraries.admin.database().ref(`sessions/online`);

    let error = null;
    let newData = {
      app: self.Manager.config?.app?.id || null,
    };

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
          _.set(newData, 'users.online', existing + keys.length)
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
    self.users = [];
    await getUsersBatch(self)
    .catch(e => {
      return reject(e);
    })
    return resolve(self.users);
  });
}

Module.prototype.getAllNotifications = function () {
  const self = this;
  return new Promise(async function(resolve, reject) {
    await self.libraries.admin.firestore().collection('notifications/subscriptions/all')
    .get()
    .then(function(querySnapshot) {
      return resolve(querySnapshot.size)
    })
    .catch(function(e) {
      return reject(e)
    });
  });
}

Module.prototype.getAllSubscriptions = function () {
  const self = this;
  return new Promise(async function(resolve, reject) {
    await self.libraries.admin.firestore().collection('users')
    .where('plan.expires.timestampUNIX', '>=', new Date().getTime() / 1000)
    .get()
    .then(function(snapshot) {
      const stats = {
        totals: {
          total: 0,
          exempt: 0,
        },
        plans: {}
      };

      snapshot
      .forEach((doc, i) => {
        const data = doc.data();
        const planId = data?.plan?.id || 'basic';
        const frequency = data?.plan?.payment?.frequency || 'unknown';
        const isAdmin = data?.roles?.admin || false;
        const isVip = data?.roles?.vip || false;

        if (!stats.plans[planId]) {
          stats.plans[planId] = {
            total: 0,
            monthly: 0,
            annually: 0,
            exempt: 0,
          }
        }

        if (isAdmin || isVip) {
          stats.totals.exempt++;
          stats.plans[planId].exempt++;
          return
        }

        stats.totals.total++;
        stats.plans[planId].total++;
        stats.plans[planId][frequency] = (stats.plans[planId][frequency] || 0) + 1
      });

      return resolve(stats);
    })
    .catch(function(e) {
      return reject(e)
    });

  });
}

function getUsersBatch(self, nextPageToken) {
  return new Promise(async function(resolve, reject) {
    self.libraries.admin.auth().listUsers(1000, nextPageToken)
      .then(function(listUsersResult) {
        self.users = self.users.concat(listUsersResult.users);
        if (listUsersResult.pageToken) {
          // List next batch of users.
          getUsersBatch(self, listUsersResult.pageToken)
            .then(() => {
              return resolve(listUsersResult.users);
            })
            .catch((e) => {
              return reject(e);
            })
        } else {
          return resolve(listUsersResult.users);
        }
      })
      .catch(function(e) {
        return reject(e);
      });
  });
}

module.exports = Module;
