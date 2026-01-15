/**
 * Schema for GET /content/post
 */
module.exports = function (assistant, settings, options) {
  return {
    url: { types: ['string'], default: undefined, required: true },
  };
};
