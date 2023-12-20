const moment = require('moment');
const powertools = require('node-powertools');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    payload.data.payload.deletionRegex = payload.data.payload.deletionRegex ? powertools.regexify(payload.data.payload.deletionRegex) : payload.data.payload.deletionRegex;

    if (!payload.user.roles.admin && assistant.meta.environment === 'production') {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    // https://googleapis.dev/nodejs/firestore/latest/v1.FirestoreAdminClient.html#exportDocuments
    // https://firebase.google.com/docs/firestore/solutions/schedule-export#firebase-cli
    // https://levelup.gitconnected.com/how-to-back-up-firestore-easily-and-automatically-eab6bf0d7e1f
    const client = new self.libraries.admin.firestore.v1.FirestoreAdminClient({
      // credential: Manager.libraries.admin.credential.cert(
      //   require(Manager.project.serviceAccountPath)
      // ),
    });
    const projectId = Manager.project.projectId;
    const resourceZone = Manager.project.resourceZone;
    const databaseName = client.databasePath(projectId, '(default)');
    const bucketName = `bm-backup-firestore-${projectId}`;
    const bucketAddress = `gs://${bucketName}`;

    await self.createBucket(bucketName, resourceZone);
    // await self.deleteOldFiles(bucketName, resourceZone);

    client.exportDocuments({
      name: databaseName,
      outputUriPrefix: bucketAddress,
      // Leave collectionIds empty to export all collections
      // or set to a list of collection IDs to export,
      collectionIds: []
    })
    .then(async (responses) => {

      const response = responses[0];
      const meta = {

      }

      assistant.log('Saved backup successfully:', response.metadata.outputUriPrefix, meta)

      await self._setMetaStats(null, meta);

      return resolve(response['name']);
    })
    .catch(async (e) => {
      await self._setMetaStats(e);
      return reject(assistant.errorify(e, {code: 500, sentry: false, send: false, log: true}).error)
    });

  });

};

Module.prototype._setMetaStats = function (error, meta) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    error = error || null;
    const isError = error instanceof Error;

    await self.libraries.admin.firestore().doc('meta/stats')
    .set({
      backups: {
        lastBackup: {
          date: {
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
          },
          status: {
            success: !isError,
            error: error,
          }
        }
      },
      metadata: Manager.Metadata().set({tag: 'admin:backup'}),
    }, {merge: true})
    .catch(e => {
      assistant.errorify(e, {code: 500, sentry: false, send: false, log: true});
    })

    return resolve();
  });
};

Module.prototype.createBucket = function (bucketName, resourceZone) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(function(resolve, reject) {
    storage.bucket(bucketName).getMetadata()
      .then(async (meta) => {
        assistant.log(`${bucketName} metadata`, meta[0])
        return resolve();
      })
      .catch(async (e) => {
        const storageCreation = await storage.createBucket(bucketName, {
          // location: 'ASIA',
          location: resourceZone,
          storageClass: 'COLDLINE',
        })
        .then(r => r)
        .catch(e => e)

        assistant.log('storageCreation', storageCreation)

        return resolve();
      })
  });
};

// https://github.com/zsolt-dev/auto-delete-gcp-storage-backups/blob/master/index.js
Module.prototype.__RETRY_deleteOldFiles = function (bucketName, resourceZone) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const now = moment();
    const deletionRegex = payload.data.payload.deletionRegex;

    // Helpers
    const getFileObjectWithMetaData = async (bucketName, fileName) => {
      const [metaData] = await storage.bucket(bucketName).file(fileName).getMetadata();
      return ({ fileName, created: metaData.timeCreated });
    };

    const deleteFileFromBucket = async (bucketName, fileName) => {
      assistant.log(`Deleting item: ${fileName}...`, );
      return await storage.bucket(bucketName).file(fileName).delete();
    };

    // Main
    // get the file names as an array
    let [allFiles] = await storage.bucket(bucketName).getFiles();
    let deletePromises = [];
    let foldersToDelete = [];
    allFiles = allFiles.map(file => file.name);
    // console.log(`all files: ${allFiles.join(', ')}`);

    allFiles.forEach((filePath, i) => {
      const fileName = filePath.split('/')[0];
      const date = moment(fileName.split('T')[0]);
      const day = date.date();
      const month = date.month();
      const age = now.diff(date, 'days', false);

      if (age >= 30) {
        if (day === 1) { return }
        deletePromises.push(deleteFileFromBucket(bucketName, backup.fileName))
        assistant.log(`Preparing to delete ${filePath}: date=${date.format('MMM Do, YYYY')}, day=${day}, month=${month}, age=${age}`, );
        // if (!foldersToDelete.includes(fileName)) {
        //   assistant.log(`Preparing to delete ${fileName}: date=${date.format('MMM Do, YYYY')}, day=${day}, month=${month}, age=${age}`, );
        //   foldersToDelete = foldersToDelete.concat(fileName);
        //   deletePromises.push(deleteFileFromBucket(bucketName, fileName))
        // }
      }
    })

    console.log('---deletePromises.length', deletePromises.length);

    return

    // transform to array of objects with creation timestamp { fileName: abc, created: xyz }
    allFiles = allFiles.map(fileName => getFileObjectWithMetaData(bucketName, fileName));
    allFiles = await Promise.all(allFiles);

    allFiles.forEach((backup, i) => {
      const date = moment(backup.created);
      const day = date.date();
      const month = date.month();
      const age = now.diff(date, 'days', false);

      assistant.log(`Sorting item ${i}: date=${date.format('MMM Do, YYYY')}, day=${day}, month=${month}, age=${age}`, );

      if (age >= 31) {
        if (day === 1) { return }
        deletePromises.push(deleteFileFromBucket(bucketName, backup.fileName))
      } else if ((deletionRegex && backup.fileName.match(deletionRegex))) {
        deletePromises.push(deleteFileFromBucket(bucketName, backup.fileName))
      }
    })

    await Promise.all(deletePromises);

    return resolve();
  });
};

Module.prototype.__deleteOldFiles = function (bucketName, resourceZone) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const now = moment();
    const deletionRegex = payload.data.payload.deletionRegex;

    // Helpers
    const getFileObjectWithMetaData = async (bucketName, fileName) => {
      const [metaData] = await storage.bucket(bucketName).file(fileName).getMetadata();
      return ({ fileName, created: metaData.timeCreated });
    };

    const deleteFileFromBucket = async (bucketName, fileName) => {
      assistant.log(`Deleting item: ${fileName}...`, );
      return await storage.bucket(bucketName).file(fileName).delete();
    };

    // Main
    // get the file names as an array
    let [allFiles] = await storage.bucket(bucketName).getFiles();
    let deletePromises = [];
    allFiles = allFiles.map(file => file.name);
    // console.log(`all files: ${allFiles.join(', ')}`);

    // transform to array of objects with creation timestamp { fileName: xyz, created: }
    allFiles = allFiles.map(fileName => getFileObjectWithMetaData(bucketName, fileName));
    allFiles = await Promise.all(allFiles);

    allFiles.forEach((backup, i) => {
      const date = moment(backup.created);
      const day = date.date();
      const month = date.month();
      const age = now.diff(date, 'days', false);

      assistant.log(`Sorting item ${i}: date=${date.format('MMM Do, YYYY')}, day=${day}, month=${month}, age=${age}`, );

      if (age >= 31) {
        if (day === 1) { return }
        deletePromises.push(deleteFileFromBucket(bucketName, backup.fileName))
      } else if ((deletionRegex && backup.fileName.match(deletionRegex))) {
        deletePromises.push(deleteFileFromBucket(bucketName, backup.fileName))
      }
    })

    await Promise.all(deletePromises);

    return resolve();
  });
};

Module.prototype._deleteOldFiles = function (bucketName, resourceZone) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Helpers
    const getFileObjectWithMetaData = async (bucketName, fileName) => {
      const [metaData] = await storage.bucket(bucketName).file(fileName).getMetadata();
      return ({ fileName, created: metaData.timeCreated });
    };

    const deleteFileFromBucket = async (bucketName, fileName) => {
      return await storage.bucket(bucketName).file(fileName).delete();
    };

    // Main
    // get the file names as an array
    let [allFiles] = await storage.bucket(bucketName).getFiles();
    allFiles = allFiles.map(file => file.name);

    assistant.log(`All files: ${allFiles.join(', ')}`);

    // transform to array of objects with creation timestamp { fileName: xyz, created: }
    allFiles = allFiles.map(fileName => getFileObjectWithMetaData(bucketName, fileName));
    allFiles = await Promise.all(allFiles);

    const filesToKeep = new Set(); // using set insted of array since set does not allow duplicates

    // recent backups
    allFiles.forEach(backup => {
      const createdDate = new Date(backup.created);
      createdDate.setHours( createdDate.getHours() + numHoursToKeepRecentBackups );

      if (createdDate > new Date()) {
        filesToKeep.add(backup.fileName)
      };
    })

    // daily backups
    for (var i = 0; i < numDaysToKeepOneDailyBackup; i++) {
      // get day
      const now = new Date();
      now.setDate( now.getDate() - i );
      dateString = now.toISOString().substring(0, 10);
      // keep only one from that day
      const backupsFromThatDay = allFiles.filter(backup => backup.created.startsWith(dateString));
      if (backupsFromThatDay && backupsFromThatDay.length > 0) {
        filesToKeep.add(backupsFromThatDay[0].fileName)
      };
    }

    // filesToKeep.forEach(item => console.log(item));

    const filesToDelete = allFiles.filter(backup => !filesToKeep.has(backup.fileName));

    assistant.log(`Deleting ${filesToDelete.length} files: ${filesToDelete.map(backup => backup.fileName).join(', ')}`);

    const deletePromises = filesToDelete.map(backup => deleteFileFromBucket(bucketName, backup.fileName));
    await Promise.all(deletePromises);

    return resolve();
  });
};

module.exports = Module;
