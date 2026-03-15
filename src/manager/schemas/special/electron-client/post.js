/**
 * Schema for POST /special/electron-client
 */
module.exports = () => ({
  uid: { types: ['string'], default: undefined },
  brandId: { types: ['string'], default: undefined },
  brand: { types: ['string'], default: undefined },
  config: { types: ['object'], default: {} },
});
