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
}
module.exports = Module;

// HELPERS //
let path_processing = 'notifications/processing/all/{notificationId}';
let path_subscriptions = 'notifications/subscriptions/all';
let batchPromises = [];

function sendBatch(batch, id) {
  let This = this;
  console.log(`Sending batch ID: ${id}`, batch);
  let payload = {};
  payload.notification = {};
  payload.notification.title = This.assistant.request.data.payload.title;
  payload.notification.click_action = This.assistant.request.data.payload.click_action;
  payload.notification.body = This.assistant.request.data.payload.body;
  payload.notification.icon = This.assistant.request.data.payload.icon;
  console.log('payload', payload);
  return new Promise(async function(resolve, reject) {
    await This.ref.admin.messaging().sendToDevice(batch, payload)
      .then(async function (response) {
        // This.result.batches.list.push('#' + id + ' | ' + '✅  ' + response.successCount + ' | ' + '❌  ' + response.failureCount);
        console.log('Sent batch #' + id);
        // This.result.successes += response.successCount;
        // This.result.failures += response.failureCount;
        console.log('RESP', response);
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
        console.log(`Queried ${querySnapshot.size} tokens.`);
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
        resolve();
      })
      .catch(function(error) {
        console.error("Error querying tokens: ", error);
        reject(error);
      });
  });
}

function cleanTokens() {
  return new Promise(function(resolve, reject) {
    resolve();
  });
}
