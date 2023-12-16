const pushid = require('pushid');
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');
const { get } = require('lodash');

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

      // Get app data
      fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/getApp`, {
        method: 'post',
        response: 'json',
        body: {
          id: Manager.config.app.id,
        }
      })
      .then((response) => {
        response.reviews = response.reviews || {};
        response.reviews.enabled = typeof response.reviews.enabled === 'undefined' ? true : response.reviews.enabled;
        response.reviews.sites = response.reviews.sites || [];

        // If reviews are enabled and there are review sites, prompt review
        if (response.reviews.enabled && response.reviews.sites.length > 0) {
          decision.reviewURL = powertools.random(response.reviews.sites);
        } else {
          decision.promptReview = false;
        }

        assistant.log('Feedback submitted', docId, {appReviewData: response.reviews, request: request, decision: decision});

        // Save feedback to firestore
        self.libraries.admin.firestore().doc(`feedback/${docId}`)
        .set({
          created: assistant.meta.startTime,
          feedback: request,
          decision: decision,
          owner: {
            uid: get(user, 'auth.uid', null),
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
          return reject(assistant.errorManager(`Failed to save feedback: ${e.message}`, {code: 500, sentry: true, send: false, log: true}).error)
        })
      })
      .catch((e) => {
        return reject(assistant.errorManager(`Failed to get app: ${e.message}`, {code: 500, sentry: true, send: false, log: true}).error)
      })

    })
    .catch((e) => {
      return reject(e);
    })
  });

};


module.exports = Module;
