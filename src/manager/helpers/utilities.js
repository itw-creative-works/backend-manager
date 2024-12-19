let nanoId;
let _;

function Utilities(Manager) {
  const self = this;

  // Libraries
  _ = require('lodash');

  // Cache
  self.cache = {};

  // Set Manager
  self.Manager = Manager;
}

Utilities.prototype.iterateCollection = function (callback, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;

  return new Promise(function(resolve, reject) {
    // Libraries
    const { admin } = Manager.libraries;

    // Set counters
    let batch = -1;
    let collectionCount = 0;
    let callbackResults = [];

    // Set defaults
    options = options || {};
    options.collection = options.collection || '';
    options.batchSize = options.batchSize || 1000;
    options.maxBatches = options.maxBatches || Infinity;
    options.where = options.where || [];
    options.orderBy = options.orderBy || null;
    options.startAt = options.startAt || null;
    options.startAfter = options.startAfter || null;
    options.prefetchCursor = typeof options.prefetchCursor === 'undefined'
      ? (!!options.startAt || !!options.startAfter) && !options.orderBy
      : options.prefetchCursor;
    options.log = options.log;

    // List all documents in a collection
    async function iterate(nextPageToken) {
      let query = admin.firestore().collection(options.collection);

      // Insert where clauses
      options.where
      .forEach(clause => {
        query = query.where(clause.field, clause.operator, clause.value);
      });

      // Insert orderBy
      if (typeof options.orderBy === 'string') {
        query = query.orderBy(options.orderBy);
      } else if (options.orderBy && typeof options.orderBy === 'object') {
        query = query.orderBy(options.orderBy.field, options.orderBy.direction);
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
          console.log('iterateCollection(): Total count', collectionCount);
        }
      }

      // Start at next page
      if (nextPageToken) {
        query = query.startAfter(nextPageToken);
      }

      // Limit by batch size
      query = query.limit(options.batchSize);

      // Get
      query.get()
        .then(async (snap) => {
          const lastVisible = snap.docs[snap.docs.length - 1];

          // Increment batch
          batch++;

          // If no documents, resolve
          if (snap.docs.length === 0) {
            return resolve(callbackResults);
          }

          // Log
          if (options.log) {
            console.log(`iterateCollection(): Processing batch #${batch + 1}/${options.maxBatches}`);
          }

          // Callback
          callback(
            {
              snap: snap,
              docs: snap.docs.map(x => x),
            },
            batch,
            collectionCount,
          )
          .then((r) => {
            // Append to result
            callbackResults.push(r);

            // Construct a new query starting at this document (unless we've reached the end)
            if (lastVisible && batch + 1 < options.maxBatches) {
              iterate(lastVisible)
            } else {
              return resolve(callbackResults);
            }
          })
          .catch((e) => {
          // Log
            if (options.log) {
              console.error('iterateCollection(): Callback failed', e);
            }

            // Reject
            return reject(e);
          });

        })
        .catch((e) => {
          // Log
          if (options.log) {
            console.error('iterateCollection(): Query failed', e);
          }

          // Reject
          return reject(e);
        });
    }

    // Run
    iterate();
  });
};

Utilities.prototype.iterateUsers = function (callback, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;

  return new Promise(function(resolve, reject) {
    // Libraries
    const { admin } = Manager.libraries;

    // Set counters
    let batch = -1;
    let callbackResults = [];

    // Set defaults
    options = options || {};
    options.batchSize = options.batchSize || 1000;
    options.maxBatches = options.maxBatches || Infinity;
    options.log = options.log;
    options.pageToken = options.pageToken;

    // List all users
    function iterate(nextPageToken) {
      // List batch of users, 1000 at a time.
      admin.auth()
        .listUsers(options.batchSize, nextPageToken)
        .then(async (listUsersResult) => {
          // Increment batch
          batch++;

          // If no users, resolve
          if (listUsersResult.users.length === 0) {
            return resolve(callbackResults);
          }

          // Log
          if (options.log) {
            console.log(`iterateUsers(): Processing batch #${batch + 1}/${options.maxBatches}`);
          }

          // Callback
          callback({
            snap: listUsersResult,
            users: listUsersResult.users,
            pageToken: listUsersResult.pageToken,
          }, batch)
            .then((r) => {
              // Append to result
              callbackResults.push(r);

              // Construct a new query starting at this document (unless we've reached the end)
              if (listUsersResult.pageToken && batch + 1 < options.maxBatches) {
                iterate(listUsersResult.pageToken);
              } else {
                return resolve(callbackResults);
              }
            })
            .catch((e) => {
              // Log
              if (options.log) {
                console.error('iterateUsers(): Callback failed', e);
              }

              // Reject
              return reject(e)
            });
        })
        .catch((e) => {
          // Log
          if (options.log) {
            console.error('iterateUsers(): Query failed', e);
          }

          // Reject
          return reject(e)
        });
    }

    // Run
    iterate(options.pageToken);
  });
};

Utilities.prototype.getDocumentWithOwnerUser = function (path, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;

  return new Promise(async function(resolve, reject) {
    // Libraries
    const { admin } = Manager.libraries;

    // Set options
    path = path || '';

    // Set defaults
    options = options || {};
    options.owner = options.owner || 'owner.uid';
    options.log = typeof options.log === 'undefined' ? false : options.log;

    // Set resolve/schema options
    options.resolve = options.resolve || {};
    options.resolve.schema = options.resolve.schema || '';
    options.resolve.checkRequired = options.resolve.checkRequired;
    options.resolve.assistant = options.resolve.assistant;

    // If no doc is provided, throw an error
    if (!path) {
      return reject(new Error('No document provided'));
    }

    // Get document
    const document = await admin.firestore().doc(path)
      .get()
      .then((doc) => {
        const data = doc.data();

        // If the document doesn't exist, throw an error
        if (!doc.exists) {
          return reject(new Error(`Document {${path}} not found`));
        }

        // Return
        return data;
      })
      .catch((e) => e);

    // Check for errors
    if (document instanceof Error) {
      return reject(document);
    }

    // Log the document
    if (options.log) {
      console.log('Document:', document);
    }

    // Resolve owner UID
    const ownerUID = _.get(document, options.owner);

    // Get the owner user
    const user = admin.firestore().doc(`users/${ownerUID}`)
      .get()
      .then((doc) => {
        const data = doc.data();

        // If the user doesn't exist, throw an error
        if (!doc.exists) {
          return reject(new Error(`User {${ownerUID}} not found`));
        }

        // Return
        return data;
      })
      .catch((e) => e);

    // Check for errors
    if (user instanceof Error) {
      return reject(user);
    }

    // Create the resolved user
    const userResolved = Manager.User(user).properties;

    // Log the user
    if (options.log) {
      console.log('User:', user);
      console.log('User (resolved):', userResolved);
    }

    // Resolve with schema
    if (options.resolve.schema) {
      const documentResolved = Manager.Settings().resolve(options.resolve.assistant, undefined, document, {
        schema: options.resolve.schema,
        user: userResolved,
        checkRequired: options.resolve.checkRequired,
      });

      // Log the resolved document
      if (options.log) {
        console.log('Document (resolved):', documentResolved);
      }

      // Return
      return resolve({
        document: documentResolved,
        user: userResolved,
      });
    }

    // Return without schema resolution
    return resolve({
      document: document,
      user: userResolved,
    });
  });
};

Utilities.prototype.randomId = function (options) {
  const self = this;

  // Set defaults
  options = options || {};
  options.size = options.size || 14;

  // Load library
  nanoId = nanoId
    ? nanoId
    : require('nanoid');

  // Custom alphabet
  const alphabet = nanoId.customAlphabet(
    nanoId.urlAlphabet.replace(/_|-/g, ''),
    options.size,
  )

  // Return
  return alphabet();
};

Utilities.prototype.get = function (docPath, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;

  return new Promise(function(resolve, reject) {
    // Libraries
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
