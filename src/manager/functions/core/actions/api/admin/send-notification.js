const path_processing = 'notifications/processing/all/{notificationId}';
const path_subscriptions = 'notifications/subscriptions/all';
const badTokenReasons = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']

function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    // console.log('----self.Manager.libraries', self.Manager.libraries);
    // console.log('----self.Manager.libraries.sentry 1', self.Manager.libraries.sentry);

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    if (!payload.data.payload.title || !payload.data.payload.body) {
      return reject(assistant.errorManager(`Parameters <title> and <body> required`, {code: 400, sentry: true, send: false, log: false}).error)
    }

    await self.getTokens({tags: false})
    .then(r => {
      return resolve({data: r})
    })
    .catch(e => {
      return reject(assistant.errorManager(`Failed to send notification: ${e}`, {code: 400, sentry: true, send: false, log: false}).error)
    })
  });

};

// HELPERS //
Module.prototype.getTokens = function (options) {
  const self = this;
  options = options || {};
  options.tags = options.tags || false;

  return new Promise(async function(resolve, reject) {
    let subs = self.libraries.admin.firestore().collection(path_subscriptions);
    let batchPromises = [];

    if (options.tags) {
      subs.where('tags', 'array-contains-any', options.tags)
    }
    await subs
      .get()
      .then(function(querySnapshot) {
        self.assistant.log(`Queried ${querySnapshot.size} tokens.`);
        // self.result.subscriptionsStart = querySnapshot.size;
        let batchCurrentSize = 0;
        let batchSizeMax = 1000;

        let batchCurrent = [];
        let batchLoops = 1;

        querySnapshot.forEach(function(doc) {
          // log(self, 'loading... ', batchLoops+'/'+querySnapshot.size);
          if ((batchCurrentSize < batchSizeMax - 1) && (batchLoops < querySnapshot.size)) {
            batchCurrent.push(doc.data().token);
            batchCurrentSize++;
          } else {
            let batchId = batchPromises.length + 1;
            batchCurrent.push(doc.data().token);
            batchCurrentSize++;
            console.log(`Got batch ID: ${batchId} with ${batchCurrentSize} tokens.`);
            batchPromises.push(self.sendBatch(batchCurrent, batchId));
            batchCurrent = [];
            batchCurrentSize = 0;
          }
          batchLoops++;
        });
      })
      .catch(function(e) {
        self.assistant.error('Error querying tokens: ', e, {environment: 'production'})
        reject(error);
      });

    await Promise.all(batchPromises)
      .then(function(values) {
        self.assistant.log('Finished all batches.');
      })
      .catch(function(e) {
        self.assistant.error('Error sending batches: ', e, {environment: 'production'})
      });
    resolve();

  });
}

Module.prototype.sendBatch = function (batch, id) {
  const self = this;
  return new Promise(async function(resolve, reject) {
    // self.assistant.log(`Sending batch ID: ${id}`, batch);
    self.assistant.log(`Sending batch ID: ${id}`);

    // self.assistant.log('payload', payload);

    let payload = {};
    payload.notification = {};
    payload.notification.title = self.payload.data.payload.title;
    payload.notification.clickAction = self.payload.data.payload.click_action || self.payload.data.payload.clickAction;
    payload.notification.click_action = self.payload.data.payload.click_action || self.payload.data.payload.clickAction;
    payload.notification.body = self.payload.data.payload.body;
    payload.notification.icon = self.payload.data.payload.icon || self.Manager.config.brand.brandmark;

    // payload.data = {};
    // payload.data.clickAction = self.payload.data.payload.click_action || self.payload.data.payload.clickAction;
    // payload.data.click_action = self.payload.data.payload.click_action || self.payload.data.payload.clickAction;


    await self.libraries.admin.messaging().sendToDevice(batch, payload)
      .then(async function (response) {
        // self.result.batches.list.push('#' + id + ' | ' + '✅  ' + response.successCount + ' | ' + '❌  ' + response.failureCount);
        self.assistant.log('Sent batch #' + id);
        // self.result.successes += response.successCount;
        // self.result.failures += response.failureCount;
        // console.log('RESP', response);
        if (response.failureCount > 0) {
          await self.cleanTokens(batch, response.results, id);
        }
        resolve();
      })
      .catch(function (e) {
        self.assistant.error('Error sending batch #' + id, e, {environment: 'production'});
        // self.result.status = 'fail';
        reject(e);
      })
  });
}

Module.prototype.cleanTokens = function (batch, results, id) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    let cleanPromises = [];
    // self.assistant.log(`Cleaning tokens of batch ID: ${id}`, results);
    self.assistant.log(`Cleaning tokens of batch ID: ${id}`);

    results.forEach(function (item, index) {
      if (!item.error) { return false; }
      let curCode = item.error.code;
      let token = batch[index];
      self.assistant.log(`Found bad token: ${index} = ${curCode}`);
      if (badTokenReasons.includes(curCode)) {
        cleanPromises.push(self.deleteToken(token, curCode));
      }
    })
    await Promise.all(cleanPromises)
      .catch(function(e) {
        self.assistant.log('error', "Error cleaning failed tokens: ", e);
      });
    resolve();
  });
}

Module.prototype.deleteToken = function (token, errorCode) {
  const self = this;
  return new Promise(function(resolve, reject) {
    self.libraries.admin.firestore().doc(`${path_subscriptions}/${token}`)
      .delete()
      .then(function() {
        self.assistant.log(`Deleting bad token: ${token} for reason ${errorCode}`);
        resolve();
      })
      .catch(function(error) {
        self.assistant.log('error', `Error deleting bad token: ${token} for reason ${errorCode} because of error ${error}`);
        resolve();
      })
  });
}

module.exports = Module;
