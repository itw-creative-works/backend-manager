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
    _ = Manager.require('lodash')

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
          await self.updateStats(data)
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
      .catch(function (e) {
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
Module.prototype.updateStats = function (existingData) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);
    const gatheringOnline = self.libraries.admin.database().ref(`gatherings/online`);
    const sessionsApp = self.libraries.admin.database().ref(`sessions/app`);
    const sessionsOnline = self.libraries.admin.database().ref(`sessions/online`);

    let error = null;
    let update = {
      app: _.get(self.Manager.config, 'app.id', null),
    };

    // Fix broken stats
    if (!_.get(existingData, 'users.total', null)) {
      await self.getAllUsers()
        .then(r => {
          _.set(update, 'users.total', r.length)
        })
        .catch(e => {
          error = new Error(`Failed fixing stats: ${e}`);
        })
    }

    if (error) {
      return reject(error);
    }

    // Fetch new notification stats
    await self.getAllNotifications()
      .then(r => {
        _.set(update, 'notifications.total', r)
      })
      .catch(e => {
        error = new Error(`Failed getting notifications: ${e}`);
      })

    // Fetch new subscription stats
    await self.getAllSubscriptions()
      .then(r => {
        _.set(update, 'subscriptions', r)
      })
      .catch(e => {
        error = new Error(`Failed getting subscriptions: ${e}`);
      })

    if (error) {
      return reject(error);
    }

    const _countUsersOnline = async (app) => {
      await app
        .once('value')
        .then((snap) => {
          const data = snap.val() || {};
          const keys = Object.keys(data);
          const existing = _.get(update, 'users.online', 0)
          _.set(update, 'users.online', existing + keys.length)
        })
        .catch(e => {
          error = new Error(`Failed getting online users: ${e}`);
        })
    }

    // Count users online (in old gathering)
    await _countUsersOnline(gatheringOnline);

    // Count users online (in new session)
    await _countUsersOnline(sessionsApp);

    // Count users online (in new session)
    await _countUsersOnline(sessionsOnline);

    if (error) {
      return reject(error);
    }

    // Set metadata
    update.metadata = self.Manager.Metadata().set({tag: 'admin:get-stats'})

    // Update stats
    await stats
      .set(update, { merge: true })
      .catch(function (e) {
        return reject(new Error(`Failed getting stats: ${e}`));
      })

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
        const planId = _.get(data, 'plan.id', 'basic');
        const frequency = _.get(data, 'plan.payment.frequency', 'unknown');
        const isAdmin = _.get(data, 'roles.admin', false);
        const isVip = _.get(data, 'roles.vip', false);

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
