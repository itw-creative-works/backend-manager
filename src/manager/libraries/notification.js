/**
 * Push notification library — send FCM notifications to subscribers
 *
 * Usage:
 *   const notification = require('./libraries/notification.js');
 *   await notification.send(assistant, { title, body, icon, clickAction, filters });
 *
 * Used by:
 * - POST /admin/notification route
 * - marketing-campaigns cron job (type: 'push')
 */
const PATH_NOTIFICATIONS = 'notifications';
const BAD_TOKEN_REASONS = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
];
const BATCH_SIZE = 500;

/**
 * Send push notification to FCM subscribers.
 *
 * @param {object} assistant - BEM assistant instance
 * @param {object} options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {string} [options.icon] - Notification icon URL
 * @param {string} [options.clickAction] - URL to open on click
 * @param {object} [options.filters] - Targeting filters
 * @param {Array<string>} [options.filters.tags] - Filter by tags
 * @param {string} [options.filters.owner] - Filter by owner UID
 * @param {string} [options.filters.token] - Send to specific token
 * @param {number} [options.filters.limit] - Max tokens to send to
 * @returns {{ subscribers: number, batches: number, sent: number, deleted: number }}
 */
async function send(assistant, options) {
  const { title, body, icon, clickAction, filters } = options;

  if (!title || !body) {
    throw new Error('Notification title and body are required');
  }

  // Build notification payload
  const notification = {
    title,
    body,
    imageUrl: icon
      || 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png',
    click_action: clickAction || 'https://itwcreativeworks.com',
  };

  // Add cache buster to click_action URL
  try {
    const url = new URL(notification.click_action);
    url.searchParams.set('cb', new Date().getTime());
    notification.click_action = url.toString();
  } catch (e) {
    throw new Error(`Invalid click_action URL: ${e.message}`);
  }

  assistant.log('notification.send():', notification);

  const response = { subscribers: 0, batches: 0, sent: 0, deleted: 0 };
  const filterOptions = {
    tags: filters?.tags || false,
    owner: filters?.owner || null,
    token: filters?.token || null,
    limit: filters?.limit || null,
  };

  await processTokens(assistant, notification, filterOptions, response);

  return response;
}

async function processTokens(assistant, notification, options, response) {
  const Manager = assistant.Manager;

  // Specific token — send directly
  if (options.token) {
    assistant.log(`Sending to specific token: ${options.token}`);

    try {
      await sendBatch(assistant, [options.token], 0, notification, response);
    } catch (e) {
      assistant.error('Error sending to specific token', e);
    }

    return;
  }

  // Build query conditions
  const queryConditions = [];

  if (options.tags) {
    queryConditions.push({ field: 'tags', operator: 'array-contains-any', value: options.tags });
  }
  if (options.owner) {
    queryConditions.push({ field: 'owner', operator: '==', value: options.owner });
  }

  const maxBatches = options.limit
    ? Math.ceil(options.limit / BATCH_SIZE)
    : Infinity;

  assistant.log('Processing tokens with filters:', {
    tags: options.tags,
    owner: options.owner,
    limit: options.limit,
    maxBatches,
  });

  let tokensProcessed = 0;

  await Manager.Utilities().iterateCollection(
    async (batch, index) => {
      let batchTokens = [];

      for (const doc of batch.docs) {
        if (options.limit && tokensProcessed >= options.limit) {
          break;
        }

        const data = doc.data();
        batchTokens.push(data.token);
        tokensProcessed++;
      }

      if (batchTokens.length === 0) {
        return;
      }

      try {
        assistant.log(`Sending batch ${index} with ${batchTokens.length} tokens.`);
        await sendBatch(assistant, batchTokens, index, notification, response);
      } catch (e) {
        assistant.error(`Error sending batch ${index}`, e);
      }
    },
    {
      collection: PATH_NOTIFICATIONS,
      where: queryConditions,
      batchSize: BATCH_SIZE,
      maxBatches,
      log: true,
    }
  ).catch(e => {
    assistant.error(`Error during token processing: ${e}`);
  });
}

async function sendBatch(assistant, batch, id, notification, response) {
  const { admin } = assistant.Manager.libraries;

  assistant.log(`Sending batch #${id}: tokens=${batch.length}...`);

  const messages = batch.map(token => ({
    token,
    notification: {
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
    },
    webpush: {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.imageUrl,
        click_action: notification.click_action,
      },
      data: {
        click_action: notification.click_action,
      },
      fcm_options: {
        link: notification.click_action,
      },
    },
    data: {
      click_action: notification.click_action,
    },
  }));

  const result = await admin.messaging().sendEach(messages);

  assistant.log(`Sent batch #${id}: success=${result.successCount}, failures=${result.failureCount}`);

  result.responses = result.responses.map((item, index) => {
    item.token = batch[index];
    return item;
  });

  // Clean bad tokens
  if (result.failureCount > 0) {
    await cleanTokens(assistant, batch, result.responses, id, response);
  }

  response.sent += (batch.length - result.failureCount);
  response.batches++;
}

async function cleanTokens(assistant, batch, results, id, response) {
  const { admin } = assistant.Manager.libraries;

  const cleanPromises = results
    .map((item) => {
      if (!item.error || !BAD_TOKEN_REASONS.includes(item?.error?.code)) {
        return null;
      }

      return admin.firestore().doc(`${PATH_NOTIFICATIONS}/${item.token}`).delete()
        .then(() => {
          assistant.log(`Deleted bad token: ${item.token} (${item.error.code})`);
          response.deleted++;
        })
        .catch((e) => {
          assistant.error(`Failed to delete bad token: ${item.token}`, e);
        });
    })
    .filter(Boolean);

  await Promise.all(cleanPromises);
}

module.exports = { send };
