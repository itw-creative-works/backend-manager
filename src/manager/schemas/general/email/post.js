/**
 * Schema for POST /general/email
 */
module.exports = () => ({
  id: { types: ['string'], default: undefined, required: true },
  email: { types: ['string'], default: undefined, required: true },
  name: { types: ['string'], default: '' },
});
