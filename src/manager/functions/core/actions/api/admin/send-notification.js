const path_processing = 'notifications/processing/all/{notificationId}';
const path_subscriptions = 'notifications/subscriptions/all';
const badTokenReasons = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    // Set up response obj
    payload.response.data = {
      subscribers: 0,
      batches: 0,
      sent: 0,
      deleted: 0,
    }

    // Fix notification payload
    self._notificationPayload = {
      notification: self.payload.data.payload.notification || {},
    };
    self._notificationPayload.notification.title = self.payload.data.payload.title || self.payload.data.payload.notification.title || 'Notification';
    self._notificationPayload.notification.click_action = self.payload.data.payload.click_action || self.payload.data.payload.notification.click_action || 'https://itwcreativeworks.com';
    self._notificationPayload.notification.body = self.payload.data.payload.body || self.payload.data.payload.notification.body || 'Check this out';
    self._notificationPayload.notification.icon = self.payload.data.payload.icon || self.payload.data.payload.notification.icon || self.Manager.config.brand.brandmark || 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-black-1024x1024.png';

    try {
      self._notificationPayload.notification.click_action = new URL(self._notificationPayload.notification.click_action);
      self._notificationPayload.notification.click_action.searchParams.set('cb', new Date().getTime())
      self._notificationPayload.notification.click_action = self._notificationPayload.notification.click_action.toString()
    } catch (e) {
      assistant.errorManager(`Failed to add cb to URL: ${e}`, {code: 500, sentry: false, send: false, log: true})
    }

    assistant.log('Resolved notification payload', self._notificationPayload, {environment: 'production'})

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    if (!payload.data.payload.title || !payload.data.payload.body) {
      return reject(assistant.errorManager(`Parameters <title> and <body> required`, {code: 400, sentry: true, send: false, log: false}).error)
    }

    await self.getTokens({tags: false})
    .then(r => {
      return resolve({data: payload.response.data})
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
        self.payload.response.data.subscribers = querySnapshot.size;
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
            self.payload.response.data.batches++;
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

    await self.libraries.admin.messaging().sendToDevice(batch, self._notificationPayload)
      .then(async function (response) {
        // self.result.batches.list.push('#' + id + ' | ' + '✅  ' + response.successCount + ' | ' + '❌  ' + response.failureCount);
        self.assistant.log('Sent batch #' + id);
        // self.result.successes += response.successCount;
        // self.result.failures += response.failureCount;
        // console.log('RESP', response);
        if (response.failureCount > 0) {
          await self.cleanTokens(batch, response.results, id);
        }
        self.payload.response.data.sent += (batch.length - response.failureCount);
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
      if (!item.error) {
        return false;
      }
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
        self.payload.response.data.deleted++;
        resolve();
      })
      .catch(function(error) {
        self.assistant.log('error', `Error deleting bad token: ${token} for reason ${errorCode} because of error ${error}`);
        resolve();
      })
  });
}

module.exports = Module;
