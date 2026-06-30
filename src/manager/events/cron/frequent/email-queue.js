const moment = require('moment');

// Must match the SEND_AT_LIMIT in email.js
const SEND_AT_LIMIT = 71;

// Permanent failures (bad data, deleted user) are removed immediately.
// Temporary failures (network, SendGrid outage) retry up to MAX_RETRIES
// before being removed. With the 10-minute cron cycle, 5 retries ≈ 50 minutes.
const MAX_RETRIES = 5;

/**
 * Email queue processor cron job
 *
 * Picks up emails from the `emails-queue` collection that are now within
 * SendGrid's 71-hour scheduling window and sends them back through the
 * full email.send() pipeline (build, resolve recipients, send, audit trail).
 *
 * Emails land in this queue when their `sendAt` exceeds the 71-hour limit
 * at the time of the original send() call (see email.js → saveToEmailQueue).
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const { admin } = libraries;
  const cutoff = moment().add(SEND_AT_LIMIT, 'hours').unix();

  // Query emails that are now within the SendGrid scheduling window
  const snapshot = await admin.firestore()
    .collection('emails-queue')
    .where('sendAt', '<=', cutoff)
    .limit(100)
    .get();

  if (snapshot.empty) {
    assistant.log('No queued emails ready to send');
    return;
  }

  assistant.log(`Processing ${snapshot.size} queued email(s)...`);

  const email = Manager.Email(assistant);
  let sent = 0;
  let dropped = 0;
  let retried = 0;

  await Promise.allSettled(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const { settings } = data;
    const emailId = doc.id;
    const retries = data.retries || 0;

    try {
      const result = await email.send(settings);
      assistant.log(`Queued email ${emailId} ${result.status}`);
      await doc.ref.delete();
      sent++;
    } catch (e) {
      const isPermanent = e.code >= 400 && e.code < 500;

      if (isPermanent || retries >= MAX_RETRIES) {
        assistant.error(`Dropping queued email ${emailId} after ${retries} retries: ${e.message}`);
        await doc.ref.delete();
        dropped++;
      } else {
        assistant.warn(`Queued email ${emailId} failed (retry ${retries + 1}/${MAX_RETRIES}): ${e.message}`);
        await doc.ref.set({ retries: retries + 1, lastError: e.message }, { merge: true });
        retried++;
      }
    }
  }));

  assistant.log(`Completed! (${sent} sent, ${dropped} dropped, ${retried} retried)`);
};
