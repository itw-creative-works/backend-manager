/**
 * Data requests cron job
 *
 * Processes data request status transitions:
 * - pending → complete: 14 days after creation
 * - complete → expired: 30 days after becoming complete (44 days after creation)
 *
 * Scans the entire collection (no index required) since data-requests is small.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  const { admin } = libraries;
  const nowUNIX = Math.round(Date.now() / 1000);

  const FOURTEEN_DAYS = 14 * 24 * 60 * 60;
  const FORTY_FOUR_DAYS = 44 * 24 * 60 * 60;

  assistant.log('Starting...');

  // Only fetch requests created within the last 45 days (single-field filter, no composite index needed)
  const snapshot = await admin.firestore()
    .collection('data-requests')
    .where('metadata.created.timestampUNIX', '>', nowUNIX - FORTY_FOUR_DAYS - 86400)
    .get();

  assistant.log(`Found ${snapshot.size} total data requests`);

  let completed = 0;
  let expired = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const createdUNIX = data.metadata?.created?.timestampUNIX || 0;
    const age = nowUNIX - createdUNIX;

    if (data.status === 'pending' && age >= FOURTEEN_DAYS) {
      await doc.ref.update({ status: 'complete' })
        .then(() => {
          completed++;
          assistant.log(`Completed request ${doc.id} (age: ${Math.round(age / 86400)}d)`);
        })
        .catch((e) => {
          assistant.error(`Failed to complete request ${doc.id}: ${e.message}`);
        });
    } else if (data.status === 'complete' && age >= FORTY_FOUR_DAYS) {
      await doc.ref.update({ status: 'expired' })
        .then(() => {
          expired++;
          assistant.log(`Expired request ${doc.id} (age: ${Math.round(age / 86400)}d)`);
        })
        .catch((e) => {
          assistant.error(`Failed to expire request ${doc.id}: ${e.message}`);
        });
    }
  }

  assistant.log(`Completed! (${completed} completed, ${expired} expired)`);
};
