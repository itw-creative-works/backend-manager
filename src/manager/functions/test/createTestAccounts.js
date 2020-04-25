let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant(data.req, data.res)

    return this;
  },
  main: async function() {
    let uuid4;
    let req = this.req;
    let res = this.res;
    let libraries = this.libraries;
    let assistant = this.assistant;
    return libraries.cors(req, res, async () => {
      let assistant = this.assistant;

      let response = {
        status: 200,
        data: {}
      }

      // await createUser('_test.admin@test.com', '_test.admin', {roles: {admin: true}})
      try {
        response.data = {
          regular: await createUser('_test.admin@test.com', '_test.admin', {roles: {admin: true}}),
          admin: await createUser('_test.regular@test.com', '_test.regular', {roles: {}, password: 'qweqwe'}),
        }
      } catch (e) {
        response.status = 500;
        response.error = e;
        assistant.log(e);
        return res.status(response.status).json(response);
      }


      if (assistant.meta.environment == 'development') {
        assistant.log(response);
        return res.status(response.status).json(response);
      } else {
        response.data = {};
        return res.status(response.status).json(response);
      }

      async function deleteUser(uid) {
        let currentUid;
        return new Promise(async function(resolve, reject) {
          // await libraries.admin.auth().getUserByEmail(email)
          // .then(function(userRecord) {
          //   // See the UserRecord reference doc for the contents of userRecord.
          //   currentUid = userRecord.toJSON().uid;
          //   // assistant.log('Successfully fetched user data:', userRecord.toJSON());
          // })
          // .catch(function(error) {
          //   // assistant.log('Error fetching user data:', error);
          // });

          await libraries.admin.auth().deleteUser(uid)
          .then(function() {
            // assistant.log('Successfully deleted user', currentUid);
            resolve();
          })
          .catch(function(error) {
            // assistant.log('Error deleting user:', currentUid, error);
            resolve();
          });
        });
      }

      async function createUser(email, uid, options) {
        uuid4 = uuid4 || require('uuid/v4');
        options = options || {};
        options.password = options.password || uuid4();
        options.roles = options.roles || {};

        let result = {};
        return new Promise(async function(resolve, reject) {
          await deleteUser(uid);
          libraries.admin.auth().createUser({
            uid: uid,
            email: email,
            password: options.password,
          })
          .then(async function(user) {
            // See the UserRecord reference doc for the contents of userRecord.
            result = {
              uid: uid,
              email: email,
              password: options.password
            };

            let SignUpHandler = require('../core/signUpHandler.js');
            SignUpHandler.init(Manager, {
              req: req,
              res: res,
            })
            SignUpHandler.signUp({
              timestamp: assistant.meta.startTime.timestamp,
              timestampUNIX: assistant.meta.startTime.timestampUNIX,
              uid: uid,
              email: email,
              roles: options.roles,
            })

            // libraries.admin.firestore().doc(`users/${uid}`)
            // .set(
            //   {
            //     roles: options.roles,
            //   },
            //   {
            //     merge: true
            //   }
            // )
            .then(function(data) {
              assistant.log('Successfully created new user:', uid);
              resolve(result);
            })
            .catch(function(error) {
              assistant.log('Error adding to db:', error);
              reject(error);
            });
          })
          .catch(function(error) {
            assistant.log('Error creating new user:', error);
            reject(error);
          });
        });
      }

    });

  },
  other: async function () {

  }
}
module.exports = Module;
