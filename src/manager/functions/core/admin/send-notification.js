let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant({req: data.req, res: data.res})

    return this;
  },
  main: async function() {
    let self = this;
    let req = self.req;
    let res = self.res;
    let libraries = self.libraries;
    let assistant = self.assistant;

    return libraries.cors(req, res, async () => {
      let response = {
        status: 200,
        data: {},
        error: null,
      };

      let payload = self.assistant.request.data.payload || {};
      if (!payload.title || !payload.body) {
        response.status = 500;
        response.error = new Error('Not enough notification parameters supplied.');
        assistant.error(response.error, { environment: 'production' })
        return res.status(response.status).send(response.error.message);
      }

      // authenticate admin!
      let user = await assistant.authenticate();
      if (!user.roles.admin) {
        response.status = 500;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, { environment: 'production' })
        return res.status(response.status).send(response.error.message);
      } else {
        await self.getTokens({tags: false});
      }

      // assistant.log(assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }

    });
  },
  getTokens: getTokens,
  sendBatch: sendBatch,
  cleanTokens: cleanTokens,
  deleteToken: deleteToken,
}
module.exports = Module;

// HELPERS //
let path_processing = 'notifications/processing/all/{notificationId}';
let path_subscriptions = 'notifications/subscriptions/all';
let badTokenReasons = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']
let batchPromises = [];

function sendBatch(batch, id) {
  let self = this;
  // self.assistant.log(`Sending batch ID: ${id}`, batch);
  self.assistant.log(`Sending batch ID: ${id}`);

  // self.assistant.log('payload', payload);
  return new Promise(async function(resolve, reject) {
    let payload = {};
    payload.notification = {};
    payload.notification.title = self.assistant.request.data.payload.title;
    payload.notification.click_action = self.assistant.request.data.payload.click_action;
    payload.notification.body = self.assistant.request.data.payload.body;
    payload.notification.icon = self.assistant.request.data.payload.icon;

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

function getTokens(options) {
  let self = this;
  options = options || {};
  options.tags = options.tags || false;
  return new Promise(async function(resolve, reject) {
    let subs = self.libraries.admin.firestore().collection(path_subscriptions);
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
        batchPromises = [];

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

function cleanTokens(batch, results, id) {
  let self = this;
  let cleanPromises = [];
  // self.assistant.log(`Cleaning tokens of batch ID: ${id}`, results);
  self.assistant.log(`Cleaning tokens of batch ID: ${id}`);
  return new Promise(async function(resolve, reject) {
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

function deleteToken(token, errorCode) {
  let self = this;
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
