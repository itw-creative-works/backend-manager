const MAX_AGE = 30;

function Module() {

}

Module.prototype.main = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;
    const Api = self.Api;
    const payload = self.payload;

    const { admin } = Manager.libraries;

    Api.resolveUser({adminRequired: true})
    .then(async (user) => {
      // ⛔️⛔️⛔️ This function could be triggered when the user signs up with Google after already having a email/password account
      // Get auth user from firebase
      const authUser = await admin.auth().getUser(user.auth.uid).catch(e => e);
      const requestData = payload.data.payload;

      if (authUser instanceof Error) {
        return reject(assistant.errorify(`Failed to get auth user: ${authUser}`, {code: 500}));
      }

      // Age in seconds
      const ageInSeconds = (Date.now() - new Date(authUser.metadata.creationTime)) / 1000;
      // const ageInSeconds = 0;

      assistant.log(`signUp(): ageInSeconds`, ageInSeconds);
      assistant.log(`signUp(): payload`, payload);

      // If the user is not new, reject
      // This is important to prevent this from running when they link another provider
      if (ageInSeconds >= MAX_AGE) {
        return reject(assistant.errorify(`User is not new.`, {code: 400}));
      }

      // Create the user with the base data
      const temporaryRecord = {
        signupOptions: {
          newsletter: requestData.newsletterSignUp || requestData.newsletter || false,
        }
      }
      const userRecord = {
        activity: {
          geolocation: assistant.request.geolocation,
          client: assistant.request.client,
        },
        affiliate: {
          referrer: requestData.affiliateCode || requestData.affiliate || null,
        },
        auth: {
          email: authUser.email,
          uid: authUser.uid,
        },
        metadata: Manager.Metadata().set({tag: 'user:sign-up'}),
      }

      const ipKey = assistant.request.geolocation.ip.replace(/[\.:]/g, '_');

      const promises = [];

      // Log the user
      assistant.log(`signUp(): userRecord`, userRecord);

      // Set the user and the temporary data
      promises.push(
        admin.firestore().doc(`temporary/${ipKey}`)
        .set(temporaryRecord, { merge: true }),
        admin.firestore().doc(`users/${authUser.uid}`)
        .set(userRecord, { merge: true }),
      )

      // Run the promises
      Promise.all(promises)
      .then(() => {
        return resolve({
          data: {
            signedUp: true,
          }
        });
      })
      .catch((e) => {
        return reject(assistant.errorify(e, {code: 500}));
      });
    })
    .catch((e) => {
      return reject(e);
    })

  });

};

module.exports = Module;
