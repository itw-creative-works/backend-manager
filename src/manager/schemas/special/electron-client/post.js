/**
 * Schema for POST /special/electron-client
 */
module.exports = () => ({
  uid: { types: ['string'], default: undefined },
  appId: { types: ['string'], default: undefined },
  app: { types: ['string'], default: undefined },
  config: { types: ['object'], default: {} },
});
