function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.Manager.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    } else {
      const stats = self.libraries.admin.firestore().doc(`meta/stats`)
      await stats
        .get()
        .then(async (doc) => {
          let data = doc.data() || {};
          let error = null;

          await self.fixStats(data)
            .catch(e => {
              error = e;
            })

          await self.updateStats()
            .catch(e => {
              error = e;
            })

          if (error) {
            return reject(assistant.errorManager(error, {code: 500, sentry: false, send: false, log: false}).error)
          }

          await stats
            .get()
            .then(doc => {
              data = doc.data() || {};
            })
            .catch((e) => {
              error = e;
            })

          if (error) {
            return reject(assistant.errorManager(error, {code: 500, sentry: false, send: false, log: false}).error)
          }

          return resolve({data: data})
        })
        .catch(function (e) {
          return reject(assistant.errorManager(`Failed to get: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
        })
    }
  });

};

Module.prototype.fixStats = function (data) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);

    if (!data || !data.users || !data.users.total || !data.subscriptions || !data.subscriptions.total) {
      let usersTotal = 0;
      let subscriptionsTotal = 0;
      let error = null;
      await self.getAllUsers()
        .then(r => {
          usersTotal = r.length
        })
        .catch(e => {
          error = new Error(`Failed fixing stats: ${e}`);
          self.assistant.error(error, {environment: 'production'});
        })
      await self.getAllSubscriptions()
        .then(r => {
          subscriptionsTotal = r
        })
        .catch(e => {
          error = new Error(`Failed getting subscriptions: ${e}`);
          self.assistant.error(error, {environment: 'production'});
        })

      if (error) {
        return reject(error);
      }
      await stats
        .set({
          users: {
            total: usersTotal,
          },
          subscriptions: {
            total: subscriptionsTotal,
          },
        }, { merge: true })
        .catch(function (e) {
          return reject(e);
        })
    }

    return resolve(data);
  });
}

Module.prototype.updateStats = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const stats = self.libraries.admin.firestore().doc(`meta/stats`);
    let online = self.libraries.admin.database().ref(`gatherings/online`);
    let onlineCount = 0;
    let error = null;

    await online
      .once('value')
      .then((snap) => {
        let data = snap.val() || {};
        let keys = Object.keys(data);
        onlineCount = keys.length;
      })
      .catch(e => {
        error = new Error(`Failed getting online users: ${e}`);
      })

    if (error) {
      return reject(error);
    }

    await stats
      .set({
        users: {
          online: onlineCount
        }
      }, { merge: true })
      .catch(function (e) {
        return reject(`Failed getting stats: ${e}`);
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

Module.prototype.getAllSubscriptions = function () {
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
