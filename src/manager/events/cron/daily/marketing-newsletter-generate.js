/**
 * Newsletter pre-generation cron job
 *
 * Runs daily. Looks for generator campaigns (e.g., _recurring-newsletter)
 * with sendAt within the next 24 hours. For each due campaign it runs the
 * FULL pipeline:
 *
 *   1. Fetch + filter sources from parent server (per brand category set)
 *   2. AI authors structured content (subject, sections/dispatches, signoff, ...)
 *   3. AI authors per-section SVG, rasterized to PNG
 *   4. Upload PNGs to itw-creative-works/newsletter-assets/{brandId}/{newId}/
 *      and render MJML → email-safe HTML embedding those URLs
 *   5. Upload the rendered newsletter.html into the same folder so the issue
 *      has a browseable, downloadable archive (and a paste-into-Beehiiv URL)
 *   6. Create a NEW pending campaign doc with the generated content + asset URLs
 *   7. Advance the recurring template's sendAt to the next occurrence
 *
 * The generated campaign appears on the calendar for review.
 * The frequent cron picks it up and sends it when sendAt is due.
 *
 * Generated doc shape (marketing-campaigns/{newId}):
 *   {
 *     settings:        { ...generated content, subject, contentHtml, ... },
 *     assets:          { folderUrl, htmlUrl, imageUrls, campaignId },
 *     meta:            { telemetry — tokens, cost, durations, source scores },
 *     type, sendAt, status: 'pending', generatedFrom, metadata
 *   }
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

    // Reserve the new doc ID UP FRONT so the generator can use it as the
    // GitHub folder name. The asset URLs (raw.githubusercontent.com/.../{newId}/...)
    // get baked into the rendered HTML, and we want those URLs to match the
    // Firestore doc that hosts the campaign. Stable, predictable, browseable.
    const newId = pushid();

    // Run the generator with imageHost forced to 'github' (production cron
    // path always uploads — that's what "production" means here) and the
    // campaignId pinned so all assets land in marketing-campaigns/{newId}/'s
    // matching folder. publishArticle: true so the linked blog post (when
    // config.article.enabled is on) is actually committed to the website repo.
    const generated = await generators[generator].generate(Manager, assistant, settings, {
      campaignId: newId,
      imageHost: 'github',
      publishArticle: true,
    });

    if (!generated) {
      assistant.log(`Generator "${generator}" returned no content for ${campaignId}, skipping`);
      continue;
    }

    const nowISO = new Date().toISOString();
    const nowUNIX = Math.round(Date.now() / 1000);

    // Strip non-serializable / oversized fields out of the generator's return
    // before writing to Firestore.
    //   images: Buffer[] — not safe to persist
    //   mjml:   raw template string — pollutes the doc, available in the GH archive
    //   structure: full JSON dump (5-10kb) — available via assets.markdownUrl + assets.htmlUrl
    //   contentMarkdown: large markdown blob — available via assets.markdownUrl
    const {
      images: _images,
      mjml: _mjml,
      structure: _structure,
      contentMarkdown: _contentMarkdown,
      assets,
      meta,
      ...campaignSettings
    } = generated;

    await admin.firestore().doc(`marketing-campaigns/${newId}`).set({
      settings: campaignSettings,
      assets: assets || null,   // { folderUrl, htmlUrl, markdownUrl, summaryUrl, imageUrls, beehiivPostId, tags, campaignId }
      meta:   meta   || null,   // tokens, cost, durations, source scores
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
    if (assets?.htmlUrl) {
      assistant.log(`  HTML:     ${assets.htmlUrl}`);
      assistant.log(`  Markdown: ${assets.markdownUrl || '(none)'}`);
      assistant.log(`  Summary:  ${assets.summaryUrl || '(none)'}`);
      assistant.log(`  Folder:   ${assets.folderUrl}`);
    }
    if (assets?.beehiivPostId) {
      assistant.log(`  Beehiiv:  draft post ${assets.beehiivPostId}`);
    }
    if (assets?.tags?.length) {
      assistant.log(`  Tags:     ${assets.tags.join(', ')}`);
    }

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
