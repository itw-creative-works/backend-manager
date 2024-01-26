const {get, merge} = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    // If the user is not an admin, reject
    if (!payload.user.roles.admin && assistant.isProduction()) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}));
    }

    // Get lastPageToken from meta/stats
    self.libraries.admin.firestore().doc(`meta/stats`)
      .get()
      .then(async (doc) => {
        const data = doc.data() || {};
        const lastPageToken = get(data, 'syncUsers.lastPageToken', undefined);
        let processedUsers = 0;

        // Initial pageToken
        assistant.log(`Running syn-users based on lastPageToken: ${lastPageToken}`);

        // List firebase auth users
        await Manager.Utilities().iterateUsers(function (batch, index) {
          return new Promise(async function(resolve, reject) {

            // Process user function
            async function _process(user, i) {
              const account = user.toJSON();
              const uid = account.uid;
              const email = account.email;
              const created = new Date(account.metadata.creationTime);
              const activity = new Date(account.metadata.lastSignInTime);
              const isAnonymous = account.providerData.length === 0;

              // Skip anonymous users
              if (isAnonymous) {
                return
              }

              // Add the user to the database only if it doesn't exist
              await self.libraries.admin.firestore().doc(`users/${account.uid}`)
                .get()
                .then(async (doc) => {
                  const data = doc.data() || {};

                  const newUser = Manager.User({
                    auth: {
                      uid: uid,
                      email: email,
                    },
                    activity: {
                      created: {
                        timestamp: created.toISOString(),
                        timestampUNIX: Math.floor(created.getTime() / 1000),
                      },
                      lastActivity: {
                        timestamp: activity.toISOString(),
                        timestampUNIX: Math.floor(activity.getTime() / 1000),
                      },
                    }
                  });

                  const finalData = merge(newUser.properties, data);

                  // Set metadata
                  finalData.metadata = Manager.Metadata().set({tag: 'admin:sync-users'});

                  // Save to database
                  await self.libraries.admin.firestore().doc(`users/${account.uid}`)
                    .set(finalData, {merge: true})
                    .then(r => {
                      assistant.log(`Synched user: ${account.uid}`);
                      processedUsers++;
                    })
                })
            }

            // Process each user
            for (var i = 0; i < batch.users.length; i++) {
              await _process(batch.users[i], i);
            }

            // Save to database only if there is a page token
            if (batch.pageToken) {
              await self.libraries.admin.firestore().doc(`meta/stats`)
                .update({
                  syncUsers: {
                    lastPageToken: batch.pageToken,
                  }
                })
                .then(r => {
                  assistant.log(`Saved lastPageToken: ${batch.pageToken}`);
                })
                .catch(e => {
                  assistant.error('Failed to update lastPageToken', e);
                })
            }

            return resolve();
          })
        }, {batchSize: 10, log: true, pageToken: lastPageToken})

        assistant.log(`Processed ${processedUsers} users.`);

        // Complete
        return resolve();
      })
      .catch(e => {
        return reject(assistant.errorify(e, {code: 500, sentry: false, send: false, log: false}));
      })
  });

};

module.exports = Module;
