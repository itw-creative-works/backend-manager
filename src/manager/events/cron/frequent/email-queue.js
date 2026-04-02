const moment = require('moment');

// Must match the SEND_AT_LIMIT in email.js
const SEND_AT_LIMIT = 71;

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

  const results = await Promise.allSettled(snapshot.docs.map(async (doc) => {
    const { settings } = doc.data();
    const emailId = doc.id;

    const result = await email.send(settings);
    assistant.log(`Queued email ${emailId} ${result.status}`);

    await doc.ref.delete();
  }));

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  for (const r of results) {
    if (r.status === 'rejected') {
      assistant.error(`Failed to send queued email: ${r.reason?.message}`, r.reason);
    }
  }

  assistant.log(`Completed! (${sent} sent, ${failed} failed)`);
};
