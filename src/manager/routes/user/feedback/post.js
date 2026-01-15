const pushid = require('pushid');
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');

/**
 * POST /user/feedback - Submit user feedback
 * Saves feedback to Firestore and optionally prompts for review
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const docId = pushid();

  // Preprocess decision
  const decision = {
    promptReview: false,
    reviewURL: null,
  };

  // If rating is like or love and like feedback is more than dislike feedback
  if (
    ['like', 'love'].includes(settings.rating)
    && (settings.like?.length || 0) >= (settings.dislike?.length || 0) + 10
  ) {
    decision.promptReview = true;
  }

  // Get app data for review URLs
  const appResponse = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
    method: 'post',
    response: 'json',
    body: { id: Manager.config.app.id },
  }).catch((e) => {
    assistant.error(`Failed to get app: ${e.message}`);
    return {};
  });

  const reviews = appResponse.reviews || {};
  reviews.enabled = typeof reviews.enabled === 'undefined' ? true : reviews.enabled;
  reviews.sites = reviews.sites || [];

  // If reviews are enabled and there are review sites, prompt review
  if (decision.promptReview && reviews.enabled && reviews.sites.length > 0) {
    decision.reviewURL = powertools.random(reviews.sites);
  } else {
    decision.promptReview = false;
  }

  assistant.log('Feedback submitted', docId, { appReviewData: reviews, settings, decision });

  // Save feedback to Firestore
  await admin.firestore().doc(`feedback/${docId}`)
    .set({
      created: assistant.meta.startTime,
      feedback: {
        rating: settings.rating,
        like: settings.like,
        dislike: settings.dislike,
        comments: settings.comments,
      },
      decision: decision,
      owner: {
        uid: user?.auth?.uid ?? null,
      },
      metadata: Manager.Metadata().set({ tag: 'user/feedback' }),
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to save feedback: ${e.message}`, { code: 500, sentry: true });
    });

  return assistant.respond({
    review: decision,
    originalRequest: {
      rating: settings.rating,
      like: settings.like,
      dislike: settings.dislike,
      comments: settings.comments,
    },
  });
};
