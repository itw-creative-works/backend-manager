const pushid = require('pushid');
const powertools = require('node-powertools');

/**
 * POST /user/feedback - Submit user feedback
 * Saves feedback to Firestore and optionally prompts for review
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const { admin } = libraries;

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

  // Prompt for review if user gave positive rating (like/love) and wrote meaningful positive feedback (50+ chars)
  const totalPositiveLength = (settings.positive?.length || 0) + (settings.comments?.length || 0);
  if (
    ['like', 'love'].includes(settings.rating)
    && totalPositiveLength >= 50
  ) {
    decision.promptReview = true;
  }

  // Get review config from local config
  const reviews = { ...(Manager.config.reviews || {}) };
  reviews.enabled = typeof reviews.enabled === 'undefined' ? true : reviews.enabled;
  reviews.sites = reviews.sites || [];

  // If reviews are enabled and there are review sites, build the full review URL
  if (decision.promptReview && reviews.enabled && reviews.sites.length > 0) {
    const site = powertools.random(reviews.sites);
    const brandDomain = new URL(Manager.config.brand.url).hostname;

    decision.reviewURL = `https://www.${site}/review/${brandDomain}`;
  } else {
    decision.promptReview = false;
  }

  assistant.log('Feedback submitted', docId, { appReviewData: reviews, settings, decision });

  // Save feedback to Firestore
  await admin.firestore().doc(`feedback/${docId}`)
    .set({
      feedback: {
        rating: settings.rating,
        positive: settings.positive,
        negative: settings.negative,
        comments: settings.comments,
      },
      decision: decision,
      owner: user?.auth?.uid ?? null,
      metadata: {
        ...Manager.Metadata().set({ tag: 'user/feedback' }),
        created: assistant.meta.startTime,
      },
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to save feedback: ${e.message}`, { code: 500, sentry: true });
    });

  return assistant.respond({
    review: decision,
    originalRequest: {
      rating: settings.rating,
      positive: settings.positive,
      negative: settings.negative,
      comments: settings.comments,
    },
  });
};
