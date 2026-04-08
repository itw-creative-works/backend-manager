/**
 * Newsletter pre-generation cron job
 *
 * Runs daily. Looks for generator campaigns (e.g., _recurring-newsletter)
 * with sendAt within the next 24 hours. Generates content via AI and creates
 * a NEW standalone pending campaign with the real content.
 *
 * The generated campaign appears on the calendar for review.
 * The frequent cron picks it up and sends it when sendAt is due.
 *
 * After generating, advances the recurring doc's sendAt to the next occurrence.
 *
 * Runs on bm_cronDaily.
 */
const moment = require('moment');
const pushid = require('pushid');

// Generator modules — keyed by generator field value
const generators = {
  newsletter: require('../../../libraries/email/generators/newsletter.js'),
};

module.exports = async ({ Manager, assistant, libraries }) => {
  const { admin } = libraries;

  const now = Math.round(Date.now() / 1000);
  const oneDayFromNow = now + (24 * 60 * 60);

  // Find generator campaigns with sendAt within the next 24 hours
  const snapshot = await admin.firestore()
    .collection('marketing-campaigns')
    .where('status', '==', 'pending')
    .where('sendAt', '<=', oneDayFromNow)
    .get();

  // Filter to only generator campaigns (can't query on field existence in Firestore)
  const generatorDocs = snapshot.docs.filter(doc => doc.data().generator);

  if (!generatorDocs.length) {
    assistant.log('No generator campaigns due within 24 hours');
    return;
  }

  assistant.log(`Pre-generating ${generatorDocs.length} campaign(s)...`);

  for (const doc of generatorDocs) {
    const data = doc.data();
    const { settings, type, generator, recurrence } = data;
    const campaignId = doc.id;

    if (!generators[generator]) {
      assistant.log(`Unknown generator "${generator}" on ${campaignId}, skipping`);
      continue;
    }

    assistant.log(`Generating content for ${campaignId} (${generator}): ${settings.name}`);

    // Run the generator
    const generated = await generators[generator].generate(Manager, assistant, settings);

    if (!generated) {
      assistant.log(`Generator "${generator}" returned no content for ${campaignId}, skipping`);
      continue;
    }

    // Create a new standalone campaign with the generated content
    const newId = pushid();
    const nowISO = new Date().toISOString();
    const nowUNIX = Math.round(Date.now() / 1000);

    await admin.firestore().doc(`marketing-campaigns/${newId}`).set({
      settings: generated,
      type,
      sendAt: data.sendAt,
      status: 'pending',
      generatedFrom: campaignId,
      metadata: {
        created: { timestamp: nowISO, timestampUNIX: nowUNIX },
        updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
      },
    });

    assistant.log(`Created campaign ${newId} from generator ${campaignId}: "${generated.subject}"`);

    // Advance the recurring doc's sendAt to the next occurrence
    if (recurrence) {
      const nextSendAt = getNextOccurrence(data.sendAt, recurrence);

      await doc.ref.set({
        sendAt: nextSendAt,
        metadata: {
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      }, { merge: true });

      assistant.log(`Advanced ${campaignId} sendAt to ${moment.unix(nextSendAt).toISOString()}`);
    }
  }

  assistant.log('Pre-generation complete');
};

/**
 * Calculate the next occurrence unix timestamp.
 */
function getNextOccurrence(currentSendAt, recurrence) {
  const current = moment.unix(currentSendAt);
  const { pattern } = recurrence;

  switch (pattern) {
    case 'daily':     return current.add(1, 'day').unix();
    case 'weekly':    return current.add(1, 'week').unix();
    case 'monthly':   return current.add(1, 'month').unix();
    case 'quarterly': return current.add(3, 'months').unix();
    case 'yearly':    return current.add(1, 'year').unix();
    default:          return current.add(1, 'month').unix();
  }
}
