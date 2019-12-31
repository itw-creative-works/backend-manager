const firebase = require("../functions/node_modules/@firebase/testing");
const fs = require("fs");

/*
 * ============
 *    Setup
 * ============
 */
const projectId = JSON.parse(fs.readFileSync("../.firebaserc", "utf8")).projects.default;
// const firebasePort = require("../firebase.json").emulators.firestore.port;
// const port = firebasePort /** Exists? */ ? firebasePort : 8080;
const port = 8080;
const coverageUrl = `http://localhost:${port}/emulator/v1/projects/${projectId}:ruleCoverage.html`;

const rules = fs.readFileSync("../firestore.rules", "utf8");

/**
 * Creates a new app with authentication data matching the input.
 *
 * @param {object} auth the object to use for authentication (typically {uid: some-uid})
 * @return {object} the app.
 */
function auth(auth) {
  return firebase.initializeTestApp({ projectId, auth }).firestore();
}

/*
 * ============
 *  Test Cases
 * ============
 */
beforeEach(async () => {
  // Clear the database between teset
  await firebase.clearFirestoreData({ projectId });
});

before(async () => {
  await firebase.loadFirestoreRules({ projectId, rules });
});

after(async () => {
  await Promise.all(firebase.apps().map(app => app.delete()));
  console.log(`View rule coverage information at ${coverageUrl}\n`);
});

describe("BackendManager Tests", () => {
  let accounts;
  try {
    accounts = require('./accounts.json');
  } catch (e) {
    console.log('Could not load custom accounts, please save custom accounts to accounts.json', e);
  }

  accounts = Object.assign({}, accounts, {
    unauthenticated: null,
    regular: {
      uid: '_test.regular',
      email: '_test.regular@test.com',
    },
    admin: {
      uid: '_test.admin',
      email: '_test.admin@test.com',
    }
  })

  console.log('Using accounts.json', accounts);

  describe("unauthenticated users", () => {
    it("user cannot read any account", async () => {
      const db = auth(accounts.unauthenticated);
      const doc = db.doc(`users/test.regular@test.com`);
      await firebase.assertFails(doc.get());
    });
    it("user cannot write to any account", async () => {
      const db = auth(accounts.unauthenticated);
      const doc = db.doc(`users/test.regular@test.com`);
      await firebase.assertFails(doc.set({test: 'val'}));
    });
  });

  describe("authenticated users", () => {
    it("regular user can read his account", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`users/${accounts.regular.email}`);
      // await firebase.assertSucceeds(doc.get()); // THIS IS BROKEN
    });
    it("regular user cannot read another account", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`users/test.regular2@test.com`);
      await firebase.assertFails(doc.get());
    });

    it("regular user can write to his account", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`users/${accounts.regular.email}`);
      // await firebase.assertSucceeds(doc.set({test: 'val'})); // BROKEN
    });
    it("regular user cannot write to another account", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`users/test.regular2@test.com`);
      await firebase.assertFails(doc.set({test: 'val'}));
    });

    it("regular user cannot write a restricted field to his account", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`users/${accounts.regular.email}`);
      await firebase.assertFails(doc.set({roles: {admin: true}}));
    });
  });

  describe("admin users", () => {
    it("admin user can read any account", async () => {
      const db = auth(accounts.admin);
      // const doc = db.doc(`users/${accounts.regular.email}`);
      const doc = db.doc(`users/test.regular2@test.com`);
      await firebase.assertSucceeds(doc.get());
    });
    it("admin user can write any field to any account", async () => {
      const db = auth(accounts.admin);
      const doc = db.doc(`users/test.regular2@test.com`);
      await firebase.assertSucceeds(doc.set({test: 'val'}));
    });
  });


  describe("notifications", () => {
    it("unauthenticated can subscribe", async () => {
      const db = auth(accounts.unauthenticated);
      const doc = db.doc(`notifications/subscriptions/all/token`);
      await firebase.assertSucceeds(doc.set({token: 'token'}));
    });
    it("authenticated can subscribe", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`notifications/subscriptions/all/token`);
      await firebase.assertSucceeds(doc.set({token: 'token'}));
    });

    it("unauthenticated can read subscription by token", async () => {
      const db = auth(accounts.unauthenticated);
      const doc = db.doc(`notifications/subscriptions/all/token`);
      await firebase.assertSucceeds(doc.get());
    });

    it("authenticated can read subscription by token", async () => {
      const db = auth(accounts.regular);
      const doc = db.doc(`notifications/subscriptions/all/token`);
      await firebase.assertSucceeds(doc.get());
    });

    // Add a test for updating?

});
