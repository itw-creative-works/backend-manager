/**
 * POST /admin/notification - Send FCM push notification
 * Admin-only endpoint to send push notifications
 */
const PATH_NOTIFICATIONS = 'notifications';
const BAD_TOKEN_REASONS = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
];
const BATCH_SIZE = 500;

module.exports = async ({ assistant, Manager, user, settings, analytics, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Set up response tracking
  const response = {
    subscribers: 0,
    batches: 0,
    sent: 0,
    deleted: 0,
  };

  // Validate required fields
  if (!settings.notification.title || !settings.notification.body) {
    return assistant.respond('Parameters <title> and <body> required', { code: 400 });
  }

  // Build notification payload
  const notification = {
    title: settings.notification.title,
    body: settings.notification.body,
    imageUrl: settings.notification.icon
      || 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png',
    click_action: settings.notification.clickAction
      || settings.notification.click_action
      || 'https://itwcreativeworks.com',
  };

  // Add cache buster to click_action URL
  try {
    const url = new URL(notification.click_action);
    url.searchParams.set('cb', new Date().getTime());
    notification.click_action = url.toString();
  } catch (e) {
    return assistant.respond(`Failed to add cb to URL: ${e}`, { code: 400 });
  }

  assistant.log('Resolved notification payload', notification);

  // Build filter options
  const filterOptions = {
    tags: settings.filters.tags || false,
    owner: settings.filters.owner || null,
    token: settings.filters.token || null,
    limit: settings.filters.limit || null,
  };

  // Process tokens and send notifications
  await processTokens(Manager, assistant, admin, notification, filterOptions, response);

  // Track analytics
  analytics.event('admin/notification', { sent: response.sent });

  return assistant.respond(response);
};

// Helper: Process tokens and send notifications
async function processTokens(Manager, assistant, admin, notification, options, response) {
  // If a specific token is provided, send directly to it (useful for testing)
  if (options.token) {
    assistant.log(`Sending to specific token: ${options.token}`);

    try {
      await sendBatch(assistant, admin, [options.token], 0, notification, response);
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
        await sendBatch(assistant, admin, batchTokens, index, notification, response);
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
      assistant.error(`Error during token processing: ${e}`);
    });
}

// Helper: Send batch of notifications
async function sendBatch(assistant, admin, batch, id, notification, response) {
  try {
    assistant.log(`Sending batch #${id}: tokens=${batch.length}...`, notification);

    // Prepare messages
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
    const result = await admin.messaging().sendEach(messages);

    assistant.log(`Sent batch #${id}: tokens=${batch.length}, success=${result.successCount}, failures=${result.failureCount}`, JSON.stringify(result));

    // Attach token to response
    result.responses = result.responses.map((item, index) => {
      item.token = batch[index];
      return item;
    });

    // Clean bad tokens
    if (result.failureCount > 0) {
      await cleanTokens(assistant, admin, batch, result.responses, id, response);
    }

    // Update response
    response.sent += (batch.length - result.failureCount);
  } catch (e) {
    throw new Error(`Error sending batch ${id}: ${e}`);
  }
}

// Helper: Clean bad tokens
async function cleanTokens(assistant, admin, batch, results, id, response) {
  assistant.log(`Cleaning ${results.length} tokens of batch ID: ${id}`);

  const cleanPromises = results
    .map((item, index) => {
      const shouldClean = BAD_TOKEN_REASONS.includes(item?.error?.code);

      assistant.log(`Checking #${index}: success=${item.success}, error=${item?.error?.code || null}, clean=${shouldClean}`, item.error);

      if (!item.error || !shouldClean) {
        return null;
      }

      return deleteToken(assistant, admin, item.token, item.error.code, response);
    })
    .filter(Boolean);

  try {
    await Promise.all(cleanPromises);
    assistant.log(`Completed cleaning tokens for batch ID: ${id}`);
  } catch (e) {
    assistant.error(`Error cleaning tokens for batch ID: ${id}`, e);
  }
}

// Helper: Delete bad token
async function deleteToken(assistant, admin, token, errorCode, response) {
  try {
    await admin.firestore().doc(`${PATH_NOTIFICATIONS}/${token}`).delete();

    assistant.log(`Deleted bad token: ${token} (Reason: ${errorCode})`);

    response.deleted++;
  } catch (error) {
    assistant.error(`Failed to delete bad token: ${token} (Reason: ${errorCode})`, error);
  }
}
