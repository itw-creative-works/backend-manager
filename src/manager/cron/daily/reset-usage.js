const fetch = require('wonderful-fetch');

/**
 * Reset usage cron job
 *
 * Resets daily usage counters in both local storage and Firestore.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const storage = Manager.storage({ name: 'usage', temporary: true, clear: false, log: false });

  assistant.log('Starting...');

  // Clear local
  await clearLocal(assistant, storage);

  // Clear firestore
  await clearFirestore(Manager, assistant, libraries);
};

async function clearLocal(assistant, storage) {
  // Log status
  assistant.log('[local]: Starting...');

  // Log storage
  assistant.log('[local]: storage(apps)', storage.get('apps', {}).value());
  assistant.log('[local]: storage(users)', storage.get('users', {}).value());

  // Clear storage
  storage.setState({}).write();

  // Log status
  assistant.log('[local]: Completed!');
}

async function clearFirestore(Manager, assistant, libraries) {
  const { admin } = libraries;

  // Log status
  assistant.log('[firestore]: Starting...');

  // Clear storage
  const metrics = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
    method: 'post',
    response: 'json',
    body: {
      id: Manager.config.app.id,
    },
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

  // Ensure requests is always included as a default metric
  if (!(metrics instanceof Error)) {
    metrics.requests = metrics.requests || 1;
  }

  // Log status
  assistant.log('[firestore]: Resetting metrics', metrics);

  if (metrics instanceof Error) {
    throw assistant.errorify(`Failed to check providers: ${metrics}`, { code: 500 });
  }

  // Reset all metrics with for loop of metrics
  // TODO: OPTIMIZATION: Put all of the changes into a single batch
  for (const metric of Object.keys(metrics)) {
    assistant.log(`[firestore]: Resetting ${metric} for all users`);

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

          // Yeet if its 0
          if (data.usage[metric].period <= 0) {
            continue;
          }

          // Reset the metric
          const original = data.usage[metric].period;
          data.usage[metric].period = 0;

          // Update the doc
          await doc.ref.update({ usage: data.usage })
          .then(r => {
            assistant.log(`[firestore]: Reset ${metric} for ${doc.id} (${original} -> 0)`);
          })
          .catch(e => {
            assistant.errorify(`Error resetting ${metric} for ${doc.id}: ${e}`, { code: 500, log: true });
          });
        }

        // Complete
        return resolve();
      });
    }, {
      collection: 'users',
      where: [
        { field: `usage.${metric}.period`, operator: '>', value: 0 },
      ],
      batchSize: 5000,
      log: true,
    })
    .then((r) => {
      assistant.log(`[firestore]: Reset ${metric} for all users complete!`);
    })
    .catch(e => {
      assistant.errorify(`Error resetting ${metric} for all users: ${e}`, { code: 500, log: true });
    });
  }

  // Clear usage in firestore by deleting the entire collection
  await admin.firestore().recursiveDelete(admin.firestore().collection('usage'))
  .then(() => {
    assistant.log('[firestore]: Deleted usage collection');
  })
  .catch((e) => {
    assistant.errorify(`Error deleting usage collection: ${e}`, { code: 500, log: true });
  });
}
