// Constants
const PATH_NOTIFICATIONS = 'notifications';
const BAD_TOKEN_REASONS = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
];
const BATCH_SIZE = 500;

// Module
function Module() {

}

// Main
Module.prototype.main = function () {
  const self = this;

  // Shortcuts
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

    // Prefix payload
    payload.data.payload.notification = payload.data.payload.notification || {};
    payload.data.payload.filters = payload.data.payload.filters || {};

    // Fix notification payload
    // https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging.notification.md#notification_interface
    payload.data.payload.notification.title = payload.data.payload.notification.title
      || 'Notification';
    payload.data.payload.notification.body = payload.data.payload.notification.body
      || 'Check this out';
    payload.data.payload.notification.imageUrl = payload.data.payload.notification.icon
      || 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png';
    payload.data.payload.notification.click_action = payload.data.payload.notification.clickAction
      || payload.data.payload.notification.click_action
      || 'https://itwcreativeworks.com';

    // Set notification payload
    const notification = payload.data.payload.notification;
    const filters = payload.data.payload.filters;

    // Build filter options for processTokens
    const filterOptions = {
      tags: filters.tags || false,
      owner: filters.owner || null, // Filter by owner UID
      token: filters.token || null, // Filter by specific token (for testing)
      limit: filters.limit || null, // Limit number of tokens processed
    };

    // Set notification payload
    try {
      const url = new URL(notification.click_action);
      url.searchParams.set('cb', new Date().getTime());
      notification.click_action = url.toString();
    } catch (e) {
      reject(assistant.errorify(`Failed to add cb to URL: ${e}`, {code: 400, log: true}));
    }

    // Log
    assistant.log('Resolved notification payload', notification)

    // Check if user is admin
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    }

    // Check if title and body are set
    if (!notification.title || !notification.body) {
      return reject(assistant.errorify(`Parameters <title> and <body> required`, {code: 400, sentry: true}));
    }

    await self.processTokens(notification, filterOptions)
    .then(r => {
      return resolve({data: payload.response.data})
    })
    .catch(e => {
      return reject(assistant.errorify(`Failed to send notification: ${e}`, {code: 400, sentry: true}));
    })
  });

};

// HELPERS //
Module.prototype.processTokens = async function (notification, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  // Set options
  options = options || {};
  options.tags = options.tags || false;
  options.owner = options.owner || null;
  options.token = options.token || null;
  options.limit = options.limit || null;

  // If a specific token is provided, send directly to it (useful for testing)
  if (options.token) {
    assistant.log(`Sending to specific token: ${options.token}`);

    try {
      await self.sendBatch([options.token], 0, notification);
      assistant.log('Single token notification sent successfully.');
    } catch (e) {
      assistant.error('Error sending to specific token', e);
    }

    return;
  }

  // Build query conditions
  const queryConditions = [];

  // Filter by tags
  if (options.tags) {
    queryConditions.push({ field: 'tags', operator: 'array-contains-any', value: options.tags });
  }

  // Filter by owner UID
  if (options.owner) {
    queryConditions.push({ field: 'owner', operator: '==', value: options.owner });
  }

  // Calculate max batches based on limit
  const maxBatches = options.limit
    ? Math.ceil(options.limit / BATCH_SIZE)
    : Infinity;

  // Log filter options
  assistant.log('Processing tokens with filters:', {
    tags: options.tags,
    owner: options.owner,
    limit: options.limit,
    maxBatches: maxBatches,
  });

  // Track tokens processed for limit
  let tokensProcessed = 0;

  // Batch processing logic
  await Manager.Utilities().iterateCollection(
    async (batch, index) => {
      let batchTokens = [];

      // Collect tokens from the current batch
      for (const doc of batch.docs) {
        // Stop if we've hit the limit
        if (options.limit && tokensProcessed >= options.limit) {
          break;
        }

        const data = doc.data();
        batchTokens.push(data.token);
        tokensProcessed++;
      }

      // Skip if no tokens to send
      if (batchTokens.length === 0) {
        return;
      }

      // Send the batch
      try {
        assistant.log(`Sending batch ${index} with ${batchTokens.length} tokens.`);
        await self.sendBatch(batchTokens, index, notification);
      } catch (e) {
        assistant.error(`Error sending batch ${index}`, e);
      }
    },
    {
      collection: PATH_NOTIFICATIONS,
      where: queryConditions,
      batchSize: BATCH_SIZE,
      maxBatches: maxBatches,
      log: true,
    }
  )
  .then(() => {
    assistant.log('All batches processed successfully.');
  })
  .catch(e => {
    assistant.errorify(`Error during token processing: ${e}`, { code: 500, log: true });
  });
};

// Sending using SDK
// https://firebase.google.com/docs/cloud-messaging/send-message#send-messages-to-multiple-devices

// Manually sending
// https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send
// https://firebase.google.com/docs/cloud-messaging/migrate-v1#provide-credentials-manually

// Help
// https://stackoverflow.com/questions/79408734/send-firebase-cloud-messaging-fcm-notification-with-click-action
// https://stackoverflow.com/questions/72494678/an-error-occurred-when-trying-to-authenticate-to-the-fcm-servers-on-firebase-c
// https://stackoverflow.com/questions/72552943/how-can-i-add-firebase-admin-role-to-firebase-project-service-accouts

// https://stackoverflow.com/questions/50148266/click-action-attribute-for-web-push-notification-through-fcm
// https://stackoverflow.com/questions/49177428/http-v1-api-click-action-for-webpush-notification/52764782#52764782
// https://firebase.google.com/docs/cloud-messaging/js/receive#setting_notification_options_in_the_send_request
Module.prototype.sendBatch = async function (batch, id, notification) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  // Libraries
  const { admin } = self.libraries;

  try {
    // Log
    assistant.log(`Sending batch #${id}: tokens=${batch.length}...`, notification);

    // Prepare messages
    // We have to set click_action because Firebase DOES NOT properly handle it in the service worker, so we HANDLE IT OURSELVES
    const messages = batch.map(token => ({
      token: token,
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
        }
      },
      data: {
        click_action: notification.click_action,
      },
    }));

    // Send the batch
    // const response = await admin.messaging().sendToDevice(batch, note);
    const response = await admin.messaging().sendEach(messages);
    // responses: [
    //   { success: false, error: [FirebaseMessagingError] },
    //   {
    //     success: true,
    //     messageId: 'projects/promo-server-api/messages/1e91fbc4-2d50-4457-addc-b9add252ae7b'
    //   },
    //   { success: false, error: [FirebaseMessagingError] }
    // ],
    // successCount: 1,
    // failureCount: 2

    // Log
    assistant.log(`Sent batch #${id}: tokens=${batch.length}, success=${response.successCount}, failures=${response.failureCount}`, JSON.stringify(response));

    // Log
    assistant.log(`Sent batch ID: ${id}, Success: ${response.successCount}, Failures: ${response.failureCount}`);

    // Attach token to response
    response.responses = response.responses.map((item, index) => {
      item.token = batch[index];
      return item;
    });

    // Clean bad tokens
    if (response.failureCount > 0) {
      await self.cleanTokens(batch, response.responses, id);
    }

    // Update response
    payload.response.data.sent += (batch.length - response.failureCount);
  } catch (e) {
    throw assistant.errorify(`Error sending batch ${id}: ${e}`, { code: 500, log: true });
  }
};

Module.prototype.cleanTokens = async function (batch, results, id) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  // Log
  assistant.log(`Cleaning ${results.length} tokens of batch ID: ${id}`);

  // Filter out bad tokens
  const cleanPromises = results
    .map((item, index) => {
      // Check if the token is bad
      const shouldClean = BAD_TOKEN_REASONS.includes(item?.error?.code)

      // Log
      assistant.log(`Checking #${index}: success=${item.success}, error=${item?.error?.code || null}, clean=${shouldClean}`, item.error);
      assistant.log(`item.error`, item.error);
      assistant.log(`item?.error?.code`, item?.error?.code);
      assistant.log(`item?.error?.message`, item?.error?.message);

      // Quit if no error
      if (!item.error || !shouldClean) {
        return null;
      }

      // Delete the token
      return self.deleteToken(item.token, item.error.code);
    })
    // Filter out nulls for valid tokens
    .filter(Boolean);

  // Clean bad tokens
  try {
    await Promise.all(cleanPromises);
    assistant.log(`Completed cleaning tokens for batch ID: ${id}`);
  } catch (e) {
    assistant.error(`Error cleaning tokens for batch ID: ${id}`, e);
  }
};

Module.prototype.deleteToken = async function (token, errorCode) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  // Libraries
  const { admin } = self.libraries;

  // Delete the token
  try {
    // Delete the token
    await admin.firestore().doc(`${PATH_NOTIFICATIONS}/${token}`).delete();

    // Log
    assistant.log(`Deleted bad token: ${token} (Reason: ${errorCode})`);

    // Update response
    payload.response.data.deleted++;
  } catch (error) {
    assistant.error(`Failed to delete bad token: ${token} (Reason: ${errorCode})`, error);
  }
};

module.exports = Module;
