/**
 * Reset usage cron job
 *
 * Runs daily at midnight UTC and handles different reset schedules:
 * - Local storage: cleared every day
 * - Unauthenticated usage collection: deleted every day
 * - Authenticated user daily counters: reset every day
 * - Authenticated user monthly counters: reset on the 1st of each month
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const storage = Manager.storage({ name: 'usage', temporary: true, clear: false, log: false });

  assistant.log('Starting...');

  // Clear local storage (daily)
  clearLocal(assistant, storage);

  // Clear unauthenticated usage collection (daily)
  await clearUnauthenticatedUsage(assistant, libraries);

  // Reset authenticated user counters (daily + monthly on 1st)
  await resetAuthenticated(Manager, assistant);
};

function clearLocal(assistant, storage) {
  assistant.log('[local]: Clearing...');
  storage.setState({}).write();
  assistant.log('[local]: Completed!');
}

async function clearUnauthenticatedUsage(assistant, libraries) {
  const { admin } = libraries;

  assistant.log('[unauthenticated]: Deleting usage collection...');

  await admin.firestore().recursiveDelete(admin.firestore().collection('usage'))
  .then(() => {
    assistant.log('[unauthenticated]: Completed!');
  })
  .catch((e) => {
    assistant.errorify(`Error deleting usage collection: ${e}`, { code: 500, log: true });
  });
}

async function resetAuthenticated(Manager, assistant) {
  const isFirstOfMonth = new Date().getDate() === 1;
  const products = Manager.config.payment?.products || [];

  // Gather all metric names from all products
  const metricSet = { requests: true };
  for (const product of products) {
    for (const key of Object.keys(product.limits || {})) {
      metricSet[key] = true;
    }
  }
  const metricNames = Object.keys(metricSet);

  assistant.log(`[authenticated]: Resetting ${isFirstOfMonth ? 'daily + monthly' : 'daily'} for metrics`, metricNames);

  // Collect all user IDs that need resetting (deduplicated across metrics)
  // Each entry maps uid -> { ref, usage } so we only write once per user
  const usersToReset = {};

  for (const metric of metricNames) {
    // Query users with daily > 0 for this metric
    await Manager.Utilities().iterateCollection((batch) => {
      return new Promise(async (resolve) => {
        for (const doc of batch.docs) {
          if (!usersToReset[doc.id]) {
            usersToReset[doc.id] = { ref: doc.ref, usage: doc.data().usage || {} };
          }
        }
        return resolve();
      });
    }, {
      collection: 'users',
      where: [
        { field: `usage.${metric}.daily`, operator: '>', value: 0 },
      ],
      batchSize: 5000,
      log: false,
    })
    .catch(e => {
      assistant.errorify(`Error querying ${metric}.daily: ${e}`, { code: 500, log: true });
    });

    // On the 1st, also query users with monthly > 0
    if (isFirstOfMonth) {
      await Manager.Utilities().iterateCollection((batch) => {
        return new Promise(async (resolve) => {
          for (const doc of batch.docs) {
            if (!usersToReset[doc.id]) {
              usersToReset[doc.id] = { ref: doc.ref, usage: doc.data().usage || {} };
            }
          }
          return resolve();
        });
      }, {
        collection: 'users',
        where: [
          { field: `usage.${metric}.monthly`, operator: '>', value: 0 },
        ],
        batchSize: 5000,
        log: false,
      })
      .catch(e => {
        assistant.errorify(`Error querying ${metric}.monthly: ${e}`, { code: 500, log: true });
      });
    }
  }

  const userIds = Object.keys(usersToReset);
  assistant.log(`[authenticated]: Found ${userIds.length} users to reset`);

  // Single write per user: reset daily (always) + monthly (on 1st) for all metrics
  for (const uid of userIds) {
    const { ref, usage } = usersToReset[uid];

    for (const metric of metricNames) {
      if (!usage[metric]) {
        continue;
      }

      usage[metric].daily = 0;

      if (isFirstOfMonth) {
        usage[metric].monthly = 0;
      }
    }

    await ref.update({ usage })
    .then(() => {
      assistant.log(`[authenticated]: Reset ${uid}`);
    })
    .catch(e => {
      assistant.errorify(`Error resetting ${uid}: ${e}`, { code: 500, log: true });
    });
  }

  assistant.log(`[authenticated]: Completed!`);
}
