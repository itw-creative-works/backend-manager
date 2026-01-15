/**
 * Schema for POST /admin/repo/content
 */
module.exports = function (assistant, settings, options) {
  return {
    path: { types: ['string'], default: undefined, required: true },
    content: { types: ['string'], default: undefined, required: true },
    type: { types: ['string'], default: 'text' },
    githubUser: { types: ['string'], default: undefined },
    githubRepo: { types: ['string'], default: undefined },
  };
};
