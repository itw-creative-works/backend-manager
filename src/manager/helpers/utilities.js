let nanoId;

function Utilities(Manager) {
  const self = this;

  self.cache = null;

  self.Manager = Manager;
}

Utilities.prototype.iterateCollection = function (callback, options) {
  const self = this;
  const Manager = self.Manager;
  const admin = Manager.libraries.admin;

  return new Promise(function(resolve, reject) {
    let batch = -1;

    options = options || {};
    options.collection = options.collection || '';
    options.batchSize = options.batchSize || 1000;
    options.where = options.where || [];
    options.orderBy = options.orderBy || null;
    options.startAt = options.startAt || null;
    options.log = options.log;

    function listAllDocuments(nextPageToken) {
      let query = admin.firestore().collection(options.collection)

      options.where
      .forEach(clause => {
        query = query.where(clause.field, clause.operator, clause.value);
      });

      if (options.orderBy) {
        query = query.orderBy(options.orderBy);
      }

      if (batch === -1 && options.startAt) {
        query = query.startAt(options.startAt);
      }

      // Start at next page
      if (nextPageToken) {
        query = query.startAfter(nextPageToken);
      }

      // batchSize
      query = query.limit(options.batchSize);

      query.get()
        .then(async (snap) => {
          const lastVisible = snap.docs[snap.docs.length - 1];

          batch++;

          if (snap.docs.length === 0) {
            return resolve();
          }

          if (options.log) {
            console.log('Processing batch:', batch);
          }

          callback({
            snap: snap,
            docs: snap.docs.map(x => x),
          }, batch)
            .then(r => {
              // Construct a new query starting at this document
              if (lastVisible) {
                listAllDocuments(lastVisible)
              } else {
                return resolve();
              }
            })
            .catch((e) => {
              console.error('Callback failed', e);
              return reject(e);
            });

        })
        .catch((e) => {
          console.error('Query failed', e);
          return reject(e);
        });
    }

    listAllDocuments();
  });
};

Utilities.prototype.iterateUsers = function (callback, options) {
  const self = this;
  const Manager = self.Manager;
  const admin = Manager.libraries.admin;

  return new Promise(function(resolve, reject) {
    let batch = -1;

    options = options || {};
    options.batchSize = options.batchSize || 1000;
    options.log = options.log;
    options.pageToken = options.pageToken;

    function listAllUsers(nextPageToken) {
      // List batch of users, 1000 at a time.
      admin.auth()
        .listUsers(options.batchSize, nextPageToken)
        .then(async (listUsersResult) => {

          batch++;

          if (listUsersResult.users.length === 0) {
            return resolve();
          }

          if (options.log) {
            console.log('Processing batch:', batch);
          }

          callback({
            snap: listUsersResult,
            users: listUsersResult.users,
            pageToken: listUsersResult.pageToken,
          }, batch)
            .then(r => {
              if (listUsersResult.pageToken) {
                listAllUsers(listUsersResult.pageToken);
              } else {
                return resolve();
              }
            })
            .catch((e) => {
              console.error('Callback failed', e);
              return reject(e)
            });

        })
        .catch((e) => {
          console.error('Query failed', e);
          return reject(e)
        });
    }

    listAllUsers(options.pageToken);
  });
};

Utilities.prototype.randomId = function (options) {
  const self = this;

  options = options || {};
  options.size = options.size || 14;

  if (!nanoId) {
    nanoId = require('nanoid');

    nanoId = nanoId.customAlphabet(
      nanoId.urlAlphabet.replace(/_|-/g, ''),
      options.size,
    )
  }

  return nanoId();
};

Utilities.prototype.get = function (docPath, options) {
  const self = this;

  return new Promise(function(resolve, reject) {

    options = options || {};
    options.maxAge = options.maxAge || (1000 * 60 * 5); // 5 minutes

    self.cache = self.cache || self.Manager.storage({name: 'cache', temporary: true, clear: false});

    const item = self.cache.get(docPath).value();
    const age = item ? Date.now() - item.time : null;

    if (item && age && age < options.maxAge) {
      return resolve(item.doc);
    } else {
      self.Manager.libraries.admin.firestore().doc(docPath)
        .get()
        .then(async (doc) => {
          const data = doc.data();

          if (data) {
            self.cache.set(docPath, {
              doc: doc,
              time: Date.now(),
            })
            .write();
          }

          return resolve(doc);
        })
        .catch(e => reject(e));
    }
  });
};

module.exports = Utilities;
