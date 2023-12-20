const _ = require('lodash');
const fetch = require('wonderful-fetch');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;
  self.Manager = Manager;

  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();

  self.storage = Manager.storage({name: 'usage', temporary: true, clear: false, log: false});

  self.context = data.context;
  return self;
}

Module.prototype.main = function() {
  const self = this;
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    assistant.log(`cron/daily/reset-usage(): Starting main...`);

    // Clear local
    await self.clearLocal();

    // Clear firestore
    await self.clearFirestore();

    return resolve();
  });
}

Module.prototype.clearLocal = function() {
  const self = this;
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Log status
    assistant.log(`cron/daily/reset-usage() [local]: Starting...`);

    // Set variables
    const now = new Date();

    // Log storage
    assistant.log(`cron/daily/reset-usage() [local]: storage(apps)`, self.storage.get('apps', {}).value());
    assistant.log(`cron/daily/reset-usage() [local]: storage(users)`, self.storage.get('users', {}).value());

    // Clear storage
    self.storage.setState({}).write();

    // Log status
    assistant.log(`cron/daily/reset-usage() [local]: Completed!`);

    return resolve();
  });
}

Module.prototype.clearFirestore = function() {
  const self = this;
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Log status
    assistant.log(`cron/daily/reset-usage() [firestore]: Starting...`);

    // Clear storage
    const metrics = await fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/getApp`, {
      method: 'post',
      response: 'json',
      body: {
        id: Manager.config.app.id,
      }
    })
    .then(response => {
      response.products = response.products || {};

      for (let product of Object.values(response.products)) {
        product = product || {};
        product.planId = product.planId || '';

        if (product.planId.includes('basic')) {
          return product.limits;
        }
      }

      return new Error('No basic product found');
    })
    .catch(e => e);

    // Log status
    assistant.log(`cron/daily/reset-usage() [firestore]: Resetting metrics`, metrics);

    if (metrics instanceof Error) {
      return reject(assistant.errorify(`Failed to check providers: ${metrics}`, {code: 500, sentry: false, send: false, log: false}).error)
    }

    // Reset all metrics with for loop of metrics
    // TODO: OPTIMIZATION: Put all of the changes into a single batch
    for (const metric of Object.keys(metrics)) {
      assistant.log(`cron/daily/reset-usage() [firestore]: Resetting ${metric} for all users`);

      await Manager.Utilities().iterateCollection((batch, index) => {
        return new Promise(async (resolve, reject) => {
          for (const doc of batch.docs) {
            const data = doc.data();

            // Normalize the metric
            data.usage = data.usage || {};
            data.usage[metric] = data.usage[metric] || {};
            data.usage[metric].period = data.usage[metric].period || 0;
            data.usage[metric].total = data.usage[metric].total || 0;
            data.usage[metric].last = data.usage[metric].last || {};

            // Bail if its 0
            if (data.usage[metric].period <= 0) {
              continue;
            }

            // Reset the metric
            const original = data.usage[metric].period;
            data.usage[metric].period = 0;

            // Update the doc
            await doc.ref.update({usage: data.usage})
            .then(r => {
              assistant.log(`cron/daily/reset-usage() [firestore]: Reset ${metric} for ${doc.id} (${original} -> 0)`);
            })
            .catch(e => {
              assistant.errorify(`Error resetting ${metric} for ${doc.id}: ${e}`, {sentry: false, send: false, log: true})
            })
          }

          // Complete
          return resolve();
        });
      }, {
        collection: 'users',
        where: [
          {field: `usage.${metric}.period`, operator: '>', value: 0},
        ],
        batchSize: 5000,
        log: true,
      })
      .then((r) => {
        assistant.log(`cron/daily/reset-usage() [firestore]: Reset ${metric} for all users complete!`);
      })
      .catch(e => {
        assistant.errorify(`Error resetting ${metric} for all users: ${e}`, {sentry: false, send: false, log: true})
      })
    }

    // Clear temporary/usage in firestore by deleting the doc
    await libraries.admin.firestore().doc(`temporary/usage`).delete()
    .then(r => {
      assistant.log(`cron/daily/reset-usage() [firestore]: Deleted temporary/usage`);
    })
    .catch(e => {
      assistant.errorify(`Error deleting temporary/usage: ${e}`, {sentry: false, send: false, log: true})
    })

    return resolve();
  });
}


module.exports = Module;
