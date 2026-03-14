const powertools = require('node-powertools');
const { REMINDER_DELAYS, COLLECTION } = require('../../libraries/abandoned-cart-config.js');

/**
 * Abandoned cart reminder cron job
 *
 * Queries payments-carts where status is pending and nextReminderAt has passed,
 * sends escalating email reminders, and advances or completes the tracker.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const { admin } = libraries;
  const nowUNIX = Math.floor(Date.now() / 1000);

  // Query all pending carts that are due for a reminder
  const snapshot = await admin.firestore()
    .collection(COLLECTION)
    .where('status', '==', 'pending')
    .where('nextReminderAt', '<=', nowUNIX)
    .get();

  if (snapshot.empty) {
    assistant.log('No abandoned carts due for reminders');
    return;
  }

  assistant.log(`Processing ${snapshot.size} abandoned cart reminder(s)...`);

  const email = Manager.Email(assistant);
  let sent = 0;
  let completed = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const uid = data.owner;
    const reminderIndex = data.reminderIndex || 0;

    try {
      // Fetch user doc for email sending
      const userSnap = await admin.firestore().doc(`users/${uid}`).get();

      if (!userSnap.exists) {
        assistant.log(`User ${uid} not found, marking cart completed`);
        await markCompleted(doc, admin, nowUNIX);
        skipped++;
        continue;
      }

      const userDoc = userSnap.data();

      // Belt-and-suspenders: skip if user already has active paid subscription
      if (userDoc.subscription?.status === 'active'
        && userDoc.subscription?.product?.id !== 'basic') {
        assistant.log(`User ${uid} now has active subscription, marking cart completed`);
        await markCompleted(doc, admin, nowUNIX);
        skipped++;
        continue;
      }

      // Build checkout URL from cart data
      const checkoutUrl = buildCheckoutUrl(Manager.project.websiteUrl, data);

      // Resolve product name from config
      const product = (Manager.config.payment?.products || []).find(p => p.id === data.productId);
      const productName = product?.name || data.productId;
      const brandName = Manager.config.brand?.name || '';

      // Send reminder email
      assistant.log(`Sending abandoned cart reminder #${reminderIndex + 1} to uid=${uid}, product=${data.productId}`);

      email.send({
        sender: 'marketing',
        to: userDoc,
        template: 'main/order/abandoned-cart',
        subject: `Complete your ${brandName} ${productName} checkout`,
        categories: ['order/abandoned-cart', `order/abandoned-cart/reminder-${reminderIndex + 1}`],
        copy: false,
        data: {
          abandonedCart: {
            productId: data.productId,
            productName: productName,
            brandName: brandName,
            type: data.type,
            frequency: data.frequency,
            reminderNumber: reminderIndex + 1,
            totalReminders: REMINDER_DELAYS.length,
            checkoutUrl: checkoutUrl,
          },
        },
      })
        .then(() => assistant.log(`Abandoned cart email sent for uid=${uid}`))
        .catch((e) => assistant.error(`Abandoned cart email failed for uid=${uid}: ${e.message}`));

      sent++;

      // Advance to next reminder or mark completed if this was the last one
      const nextIndex = reminderIndex + 1;

      if (nextIndex >= REMINDER_DELAYS.length) {
        assistant.log(`Last reminder sent for uid=${uid}, marking cart completed`);
        await markCompleted(doc, admin, nowUNIX);
        completed++;
      } else {
        const now = powertools.timestamp(new Date(), { output: 'string' });
        const updatedNowUNIX = powertools.timestamp(now, { output: 'unix' });

        await doc.ref.set({
          reminderIndex: nextIndex,
          nextReminderAt: updatedNowUNIX + REMINDER_DELAYS[nextIndex],
          metadata: {
            updated: {
              timestamp: now,
              timestampUNIX: updatedNowUNIX,
            },
          },
        }, { merge: true });

        assistant.log(`Advanced uid=${uid} to reminder index ${nextIndex}, next at ${updatedNowUNIX + REMINDER_DELAYS[nextIndex]}`);
      }
    } catch (e) {
      assistant.error(`Error processing abandoned cart for uid=${uid}: ${e.message}`, e);
      // Continue to next document
    }
  }

  assistant.log(`Completed! (${sent} sent, ${completed} completed, ${skipped} skipped)`);
};

/**
 * Mark a cart document as completed
 */
async function markCompleted(doc, admin, nowUNIX) {
  const now = powertools.timestamp(new Date(), { output: 'string' });

  await doc.ref.set({
    status: 'completed',
    metadata: {
      updated: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
    },
  }, { merge: true });
}

/**
 * Build checkout URL from cart data
 */
function buildCheckoutUrl(baseUrl, data) {
  const url = new URL('/payment/checkout', baseUrl);
  url.searchParams.set('product', data.productId);

  if (data.frequency) {
    url.searchParams.set('frequency', data.frequency);
  }

  return url.toString();
}
