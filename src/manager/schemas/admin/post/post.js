/**
 * Schema for POST /admin/post (create)
 */
module.exports = function (assistant, settings, options) {
  return {
    title: { types: ['string'], default: undefined, required: true },
    url: { types: ['string'], default: undefined, required: true },
    description: { types: ['string'], default: undefined, required: true },
    headerImageURL: { types: ['string'], default: undefined, required: true },
    body: { types: ['string'], default: undefined, required: true },
    author: { types: ['string'], default: undefined },
    affiliate: { types: ['string'], default: '' },
    tags: { types: ['array'], default: [] },
    categories: { types: ['array'], default: [] },
    layout: { types: ['string'], default: 'blueprint/blog/post' },
    date: { types: ['string'], default: undefined },
    id: { types: ['number'], default: undefined },
    postPath: { types: ['string'], default: 'guest' },
    githubUser: { types: ['string'], default: undefined },
    githubRepo: { types: ['string'], default: undefined },
  };
};
