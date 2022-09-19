function Utilities(Manager) {
  const self = this;
  
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
    options.orderBy = options.orderBy || null;
    options.startAt = options.startAt || null;
    options.log = options.log;

    function listAllDocuments(nextPageToken) {
      let query = admin.firestore().collection(options.collection)

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

          if (options.log) {
            console.log('Processing batch:', batch);
          }          

          callback({
            snap: snap, docs: snap.docs.map(x => x)
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
    options.log = options.log;
    
    function listAllUsers(nextPageToken) {
      // List batch of users, 1000 at a time.
      admin.auth()
        .listUsers(1000, nextPageToken)
        .then(async (listUsersResult) => {
          
          batch++;

          if (options.log) {
            console.log('Processing batch:', batch);
          }

          callback({
            snap: listUsersResult, users: listUsersResult.users,
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
    
    listAllUsers();   
  });
};

module.exports = Utilities;
