// Constants
const PATH_NOTIFICATIONS = 'notifications';
const BAD_TOKEN_REASONS = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
];

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

    // Fix notification payload
    // Yes, it needs to be NESTED!!! DO NOT REMOVE THE NEST!
    const note = {
      notification: {
        title: payload.data.payload.title || 'Notification',
        body: payload.data.payload.body || 'Check this out',
        icon: payload.data.payload.icon || 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png',
        click_action: payload.data.payload.clickAction || 'https://itwcreativeworks.com',
      }
    }

    // Set notification payload
    try {
      const url = new URL(note.notification.click_action);
      url.searchParams.set('cb', new Date().getTime());
      note.notification.click_action = url.toString();
    } catch (e) {
      reject(assistant.errorify(`Failed to add cb to URL: ${e}`, {code: 400, log: true}));
    }

    // Log
    assistant.log('Resolved notification payload', note)

    // Check if user is admin
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    }

    // Check if title and body are set
    if (!note.notification.title || !note.notification.body) {
      return reject(assistant.errorify(`Parameters <title> and <body> required`, {code: 400, sentry: true}));
    }

    await self.processTokens(note, {tags: false})
    .then(r => {
      return resolve({data: payload.response.data})
    })
    .catch(e => {
      return reject(assistant.errorify(`Failed to send notification: ${e}`, {code: 400, sentry: true}));
    })
  });

};

// HELPERS //
Module.prototype.processTokens = async function (note, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  // Set options
  options = options || {};
  options.tags = options.tags || false;

  // Define collection path
  const queryConditions = options.tags
    ? [{ field: 'tags', operator: 'array-contains-any', value: options.tags }]
    : [];

  // Batch processing logic
  await Manager.Utilities().iterateCollection(
    async (batch, index) => {
      let batchTokens = [];

      // Collect tokens from the current batch
      for (const doc of batch.docs) {
        const data = doc.data();
        batchTokens.push(data.token);
      }

      // Send the batch
      try {
        assistant.log(`Sending batch ${index} with ${batchTokens.length} tokens.`);
        await self.sendBatch(batchTokens, note, index);
      } catch (e) {
        assistant.error(`Error sending batch ${index}`, e);
      }
    },
    {
      collection: PATH_NOTIFICATIONS,
      where: queryConditions,
      batchSize: 1000,
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

Module.prototype.sendBatch = async function (batch, note, id) {
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
    assistant.log(`Sending batch ID: ${id}`);

    // Send the batch
    const response = await admin.messaging().sendToDevice(batch, note);

    // Log
    assistant.log(`Sent batch ID: ${id}, Success: ${response.successCount}, Failures: ${response.failureCount}`);

    // Clean bad tokens
    if (response.failureCount > 0) {
      await self.cleanTokens(batch, response.results, id);
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
  assistant.log(`Cleaning tokens of batch ID: ${id}`);

  // Filter out bad tokens
  const cleanPromises = results
    .map((item, index) => {
      // Check if the token is bad
      if (item.error && BAD_TOKEN_REASONS.includes(item.error.code)) {
        const token = batch[index];

        // Log
        assistant.log(`Found bad token: ${token} (Reason: ${item.error.code})`);

        // Delete the token
        return self.deleteToken(token, item.error.code);
      }

      // Return null for valid tokens
      return null;
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
    assistant.error(`Failed to delete bad token: ${token} (Reason: ${errorCode}). Error: ${error}`);
  }
};

module.exports = Module;
