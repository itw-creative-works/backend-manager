let nanoId;
let _;

function Utilities(Manager) {
  const self = this;

  _ = require('lodash');

  self.cache = {};

  self.Manager = Manager;
}

Utilities.prototype.iterateCollection = function (callback, options) {
  const self = this;
  const Manager = self.Manager;
  const admin = Manager.libraries.admin;

  return new Promise(function(resolve, reject) {
    let batch = -1;
    let collectionCount = 0;

    // Set defaults
    options = options || {};
    options.collection = options.collection || '';
    options.batchSize = options.batchSize || 1000;
    options.where = options.where || [];
    options.orderBy = options.orderBy || null;
    options.startAt = options.startAt || null;
    options.startAfter = options.startAfter || null;
    options.prefetchCursor = typeof options.prefetchCursor === 'undefined'
      ? (!!options.startAt || !!options.startAfter) && !options.orderBy
      : options.prefetchCursor;
    options.log = options.log;

    // List all documents in a collection
    async function listAllDocuments(nextPageToken) {
      let query = admin.firestore().collection(options.collection);

      // Insert where clauses
      options.where
      .forEach(clause => {
        query = query.where(clause.field, clause.operator, clause.value);
      });

      // Insert orderBy
      if (options.orderBy) {
        query = query.orderBy(options.orderBy);
      }

      // Process the first batch differently
      if (batch === -1) {
        let prefetchedCursor = null;

        // Prefetch the cursor
        if (options.prefetchCursor) {
          prefetchedCursor = await admin.firestore().doc(`${options.collection}/${options.startAt || options.startAfter}`)
          .get()
          .catch(e => e);

          if (prefetchedCursor instanceof Error) {
            return reject(prefetchedCursor);
          }
        }

        // Insert startAt or startAfter
        if (options.startAt) {
          query = query.startAt(prefetchedCursor || options.startAt);
        } else if (options.startAfter) {
          query = query.startAfter(prefetchedCursor || options.startAfter);
        }

        // Calculate count
        const collectionCountResult = await query.count().get()
        .then((r) => r.data().count)
        .catch((e) => e);

        // Check for errors
        if (collectionCountResult instanceof Error) {
          return reject(collectionCountResult);
        }

        // Set collection count
        collectionCount = collectionCountResult;

        // Log
        if (options.log) {
          console.log('Total count:', collectionCount);
        }
      }

      // Start at next page
      if (nextPageToken) {
        query = query.startAfter(nextPageToken);
      }

      // batchSize
      query = query.limit(options.batchSize);

      // Get
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

          callback(
            {
              snap: snap,
              docs: snap.docs.map(x => x),
            },
            batch,
            collectionCount,
          )
          .then((r) => {
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

    // Run
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
    const Manager = self.Manager;
    const { admin } = Manager.libraries;

    // Set defaults
    options = options || {};
    options.maxAge = options.maxAge || (1000 * 60 * 5); // 5 minutes
    options.readTime = typeof options.readTime === 'undefined' ? null : options.readTime;
    options.log = typeof options.log === 'undefined' ? false : options.log;
    options.format = typeof options.format === 'undefined' ? 'raw' : options.format;

    // Check cache
    const item = _.get(self.cache, docPath, null)
    const age = item ? Date.now() - item.time : null;

    // Format
    function _format(doc) {
      if (options.format === 'raw') {
        return doc;
      } else if (options.format === 'data') {
        return doc.data();
      }
    }

    // Log
    if (options.readTime) {
      const { Timestamp } = require('firebase-admin/firestore')
      const time = Math.round(new Date(options.readTime).getTime() / 1000 / 60);
      const timeLog = new Date(time * 1000 * 60);

      // Log
      if (options.log) {
        console.log('Read time:', timeLog);
      }

      // Loop docs
      admin.firestore().runTransaction(
        updateFunction => updateFunction.get(admin.firestore().doc(docPath)),
        {readOnly: true, readTime: new Timestamp(time * 60, 0)}
      )
      .then((snap) => resolve(_format(snap)))
      .catch((e) => reject(e));
    } else if (item && age && age < options.maxAge) {
      return resolve(_format(item.doc));
    } else {
      admin.firestore().doc(docPath)
        .get()
        .then(async (doc) => {
          const data = doc.data();

          // Set cache
          if (data) {
            _.set(self.cache, docPath, {
              doc: doc,
              time: Date.now(),
            })
          }

          // Return
          return resolve(_format(doc));
        })
        .catch((e) => reject(e));
    }
  });
};

module.exports = Utilities;
