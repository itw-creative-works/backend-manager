let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant({req: data.req, res: data.res})
    this.req = data.req;
    this.res = data.res;

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;

    let response = {
      status: 200,
      data: {},
      error: null,
    };

    return libraries.cors(req, res, async () => {
      // authenticate admin!
      let user = await assistant.authenticate();

      // Analytics
      let analytics = self.Manager.Analytics({
        assistant: assistant,
        uuid: user.auth.uid,
      })
      .event({
        category: 'admin',
        action: 'get-stats',
        // label: '',
      });
            
      if (!user.roles.admin) {
        response.status = 401;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, {environment: 'production'})
      } else {
        let stats = libraries.admin.firestore().doc(`meta/stats`)

        await stats
          .get()
          .then(async function (doc) {
            response.data = doc.data() || {};
            await self.fixStats(response.data)
              .catch(e => {
                response.status = 500;
                response.error = new Error(`Failed fixing stats: ${e.message}`);
                assistant.error(response.error, {environment: 'production'})
              })

            await self.updateStats()
              .catch(e => {
                response.status = 500;
                response.error = new Error(`Failed updating stats: ${e.message}`);
                assistant.error(response.error, {environment: 'production'})
              })

            await stats
              .get()
              .then(r => {
                response.data = r.data() || {};
              })
              .catch(function (e) {
                response.status = 500;
                response.error = e;
                assistant.error(response.error, {environment: 'production'})
              })
          })
          .catch(function (e) {
            response.status = 500;
            response.error = e;
            assistant.error(response.error, {environment: 'production'})
          })
      }

      // response.data = data;

      assistant.log('Stats', assistant.request.data, response, {environment: 'production'});

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
  fixStats: function (data) {
    let self = this;
    return new Promise(async function(resolve, reject) {
      let stats = self.libraries.admin.firestore().doc(`meta/stats`);

      if (!data || !data.users || !data.users.total || !data.subscriptions || !data.subscriptions.total) {
        let usersTotal = 0;
        let subscriptionsTotal = 0;
        await self.getAllUsers()
          .then(r => {
            usersTotal = r.length
          })
          .catch(e => {
            response.status = 500;
            response.error = new Error(`Failed fixing stats: ${e.message}`);
            self.assistant.error(response.error, {environment: 'production'});
          })
        await self.getAllSubscriptions()
          .then(r => {
            subscriptionsTotal = r
          })
          .catch(e => {
            response.status = 500;
            response.error = new Error(`Failed fixing stats: ${e.message}`);
            self.assistant.error(response.error, {environment: 'production'});
          })
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
  },
  updateStats: function () {
    let self = this;
    return new Promise(async function(resolve, reject) {
      let stats = self.libraries.admin.firestore().doc(`meta/stats`);
      let online = self.libraries.admin.database().ref(`gatherings/online`);
      let onlineCount = 0;

      await online
        .once('value')
        .then((snap) => {
          let data = snap.val() || {};
          let keys = Object.keys(data);
          onlineCount = keys.length;
        })
        .catch(e => {
          return reject(e);
        })

      await stats
        .set({
          users: {
            online: onlineCount
          }
        }, { merge: true })
        .catch(function (e) {
          return reject(e);
        })

      return resolve();
    });
  },
  getAllUsers: function () {
    let self = this;
    return new Promise(async function(resolve, reject) {
      self.users = [];
      await getUsersBatch(self)
      .catch(e => {
        return reject(e);
      })
      return resolve(self.users);
    });
  },
  getAllSubscriptions: function () {
    let self = this;
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
}

module.exports = Module;

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
