/**
 * Reset usage cron job
 *
 * Runs daily at midnight UTC and handles different reset schedules:
 * - Local storage: cleared every day
 * - Unauthenticated usage collection: deleted every day
 * - Authenticated user period counters: reset on the 1st (or 2nd as grace window) of each month
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const storage = Manager.storage({ name: 'usage', temporary: true, clear: false, log: false });

  assistant.log('Starting...');

  // Clear local storage (daily)
  await clearLocal(assistant, storage);

  // Clear unauthenticated usage collection (daily)
  await clearUnauthenticatedUsage(assistant, libraries);

  // Reset authenticated user periods (monthly - 1st or 2nd of month)
  await resetAuthenticatedUsage(Manager, assistant, libraries);
};

async function clearLocal(assistant, storage) {
  assistant.log('[local]: Starting...');

  assistant.log('[local]: storage(apps)', storage.get('apps', {}).value());
  assistant.log('[local]: storage(users)', storage.get('users', {}).value());

  // Clear storage
  storage.setState({}).write();

  assistant.log('[local]: Completed!');
}

async function clearUnauthenticatedUsage(assistant, libraries) {
  const { admin } = libraries;

  assistant.log('[unauthenticated]: Deleting usage collection...');

  await admin.firestore().recursiveDelete(admin.firestore().collection('usage'))
  .then(() => {
    assistant.log('[unauthenticated]: Deleted usage collection');
  })
  .catch((e) => {
    assistant.errorify(`Error deleting usage collection: ${e}`, { code: 500, log: true });
  });
}

async function resetAuthenticatedUsage(Manager, assistant, libraries) {
  const { admin } = libraries;
  const dayOfMonth = new Date().getDate();

  // Only reset on the 1st of the month
  if (dayOfMonth !== 1) {
    assistant.log('[authenticated]: Skipping period reset (not the 1st of the month)');
    return;
  }

  assistant.log('[authenticated]: Monthly reset starting...');

  // Gather all unique metric names from ALL products
  const products = Manager.config.products || [];
  const metrics = {};

  for (const product of products) {
    const limits = product.limits || {};

    for (const key of Object.keys(limits)) {
      metrics[key] = true;
    }
  }

  // Ensure requests is always included
  metrics.requests = true;

  const metricNames = Object.keys(metrics);

  assistant.log('[authenticated]: Resetting metrics', metricNames);

  // Reset each metric for users who have usage > 0
  for (const metric of metricNames) {
    assistant.log(`[authenticated]: Resetting ${metric} for all users`);

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

          // Skip if already 0
          if (data.usage[metric].period <= 0) {
            continue;
          }

          // Reset the metric
          const original = data.usage[metric].period;
          data.usage[metric].period = 0;

          // Update the doc
          await doc.ref.update({ usage: data.usage })
          .then(r => {
            assistant.log(`[authenticated]: Reset ${metric} for ${doc.id} (${original} -> 0)`);
          })
          .catch(e => {
            assistant.errorify(`Error resetting ${metric} for ${doc.id}: ${e}`, { code: 500, log: true });
          });
        }

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
      assistant.log(`[authenticated]: Reset ${metric} for all users complete!`);
    })
    .catch(e => {
      assistant.errorify(`Error resetting ${metric} for all users: ${e}`, { code: 500, log: true });
    });
  }

  assistant.log('[authenticated]: Monthly reset completed!');
}
