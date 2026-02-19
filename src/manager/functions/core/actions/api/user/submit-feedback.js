const pushid = require('pushid');
const powertools = require('node-powertools');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    Api.resolveUser({adminRequired: true})
    .then(async (user) => {

      const docId = pushid();
      const request = payload.data.payload;

      // Preprocess
      const decision = {
        promptReview: false,
        reviewURL: null,
      }

      // If rating is like or love and like feedback is more than dislike feedback
      if (
        ['like', 'love'].includes(request.rating)
        && request.like.length >= request.dislike.length + 10
      ) {
        decision.promptReview = true;
      }

      // Get review config from local config
      const reviews = { ...(Manager.config.reviews || {}) };
      reviews.enabled = typeof reviews.enabled === 'undefined' ? true : reviews.enabled;
      reviews.sites = reviews.sites || [];

      // If reviews are enabled and there are review sites, prompt review
      if (decision.promptReview && reviews.enabled && reviews.sites.length > 0) {
        decision.reviewURL = powertools.random(reviews.sites);
      } else {
        decision.promptReview = false;
      }

      assistant.log('Feedback submitted', docId, {appReviewData: reviews, request: request, decision: decision});

      // Save feedback to firestore
      self.libraries.admin.firestore().doc(`feedback/${docId}`)
      .set({
        created: assistant.meta.startTime,
        feedback: request,
        decision: decision,
        owner: {
          uid: user?.auth?.uid ?? null,
        },
        metadata: Manager.Metadata().set({tag: 'user:submit-feedback'}),
      }, {merge: true})
      .then(r => {
        return resolve({
          data: {
            review: decision,
            originalRequest: request,
          }
        });
      })
      .catch((e) => {
        return reject(assistant.errorify(`Failed to save feedback: ${e.message}`, {code: 500, sentry: true}));
      })
    })
    .catch((e) => {
      return reject(e);
    })
  });

};


module.exports = Module;
