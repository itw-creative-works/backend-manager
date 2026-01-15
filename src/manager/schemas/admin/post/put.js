/**
 * Schema for PUT /admin/post (edit)
 */
module.exports = function (assistant, settings, options) {
  return {
    url: { types: ['string'], default: undefined, required: true },
    body: { types: ['string'], default: undefined, required: true },
    title: { types: ['string'], default: undefined },
    postPath: { types: ['string'], default: 'guest' },
    githubUser: { types: ['string'], default: undefined },
    githubRepo: { types: ['string'], default: undefined },
  };
};
