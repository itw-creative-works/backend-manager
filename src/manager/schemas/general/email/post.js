/**
 * Schema for POST /general/email
 */
module.exports = function (assistant, settings, options) {
  return {
    id: { types: ['string'], default: undefined, required: true },
    email: { types: ['string'], default: undefined, required: true },
    name: { types: ['string'], default: '' },
  };
};
