let Module = {
  init: async function (data) {
    this.ref = data.ref;
    this.req = data.req;
    this.res = data.res
    this.assistant = new this.ref.Assistant().init({
      ref: {
        req: data.req,
        res: data.res,
        admin: data.ref.admin,
        functions: data.ref.functions,
      }
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    let This = this;

    return ref.cors(req, res, async () => {
      let response = {
        status: 200,
      };

      // authenticate admin!
      let authAdmin = await assistant.authorizeAdmin();
      if (!authAdmin) {
        response.status = 500;
        response.error = 'Unauthenticated, admin required.';
      } else {
        await This.getTokens({tags: false});
      }

      assistant.log(assistant.request.data, response);
      // return 'break';
      return res.status(response.status).json(response);
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
  let This = this;
  // This.assistant.log(`Sending batch ID: ${id}`, batch);
  This.assistant.log(`Sending batch ID: ${id}`);
  let payload = {};
  payload.notification = {};
  payload.notification.title = This.assistant.request.data.payload.title;
  payload.notification.click_action = This.assistant.request.data.payload.click_action;
  payload.notification.body = This.assistant.request.data.payload.body;
  payload.notification.icon = This.assistant.request.data.payload.icon;
  // This.assistant.log('payload', payload);
  return new Promise(async function(resolve, reject) {
    await This.ref.admin.messaging().sendToDevice(batch, payload)
      .then(async function (response) {
        // This.result.batches.list.push('#' + id + ' | ' + '✅  ' + response.successCount + ' | ' + '❌  ' + response.failureCount);
        This.assistant.log('Sent batch #' + id);
        // This.result.successes += response.successCount;
        // This.result.failures += response.failureCount;
        // console.log('RESP', response);
        if (response.failureCount > 0) {
          await This.cleanTokens(batch, response.results, id);
        }
        resolve();
      })
      .catch(function (e) {
        console.error('Error sending batch #' + id, e);
        // This.result.status = 'fail';
        reject(e);
      })
  });
}

function getTokens(options) {
  let This = this;
  options = options || {};
  options.tags = options.tags || false;
  return new Promise(async function(resolve, reject) {
    let subs = This.ref.admin.firestore().collection(path_subscriptions);
    if (options.tags) {
      subs.where('tags', 'array-contains-any', options.tags)
    }
    await subs
      .get()
      .then(function(querySnapshot) {
        This.assistant.log(`Queried ${querySnapshot.size} tokens.`);
        // This.result.subscriptionsStart = querySnapshot.size;
        let batchCurrentSize = 0;
        let batchSizeMax = 1000;

        let batchCurrent = [];
        let batchLoops = 1;
        batchPromises = [];

        querySnapshot.forEach(function(doc) {
          // log(This, 'loading... ', batchLoops+'/'+querySnapshot.size);
          if ((batchCurrentSize < batchSizeMax - 1) && (batchLoops < querySnapshot.size)) {
            batchCurrent.push(doc.data().token);
            batchCurrentSize++;
          } else {
            let batchId = batchPromises.length + 1;
            batchCurrent.push(doc.data().token);
            batchCurrentSize++;
            console.log(`Got batch ID: ${batchId} with ${batchCurrentSize} tokens.`);
            batchPromises.push(This.sendBatch(batchCurrent, batchId));
            batchCurrent = [];
            batchCurrentSize = 0;
          }
          batchLoops++;
        });
      })
      .catch(function(error) {
        console.error("Error querying tokens: ", error);
        reject(error);
      });

    await Promise.all(batchPromises)
      .then(function(values) {
        This.assistant.log('Finished all batches.');
      })
      .catch(function(e) {
        console.error("Error sending batches: ", e);
        // This.result.status = 'fail';
      });
    resolve();

  });
}

function cleanTokens(batch, results, id) {
  let This = this;
  let cleanPromises = [];
  // This.assistant.log(`Cleaning tokens of batch ID: ${id}`, results);
  This.assistant.log(`Cleaning tokens of batch ID: ${id}`);
  return new Promise(async function(resolve, reject) {
    results.forEach(function (item, index) {
      if (!item.error) { return false; }
      let curCode = item.error.code;
      let token = batch[index];
      This.assistant.log(`Found bad token: ${index} = ${curCode}`);
      if (badTokenReasons.includes(curCode)) {
        cleanPromises.push(This.deleteToken(token, curCode));
      }
    })
    await Promise.all(cleanPromises)
      .catch(function(e) {
        This.assistant.log('error', "Error cleaning failed tokens: ", e);
      });
    resolve();
  });
}

function deleteToken(token, errorCode) {
  let This = this;
  return new Promise(function(resolve, reject) {
    This.ref.admin.firestore().doc(`${path_subscriptions}/${token}`)
      .delete()
      .then(function() {
        This.assistant.log(`Deleting bad token: ${token} for reason ${errorCode}`);
        resolve();
      })
      .catch(function(error) {
        This.assistant.log('error', `Error deleting bad token: ${token} for reason ${errorCode} because of error ${error}`);
        resolve();
      })
  });
}
