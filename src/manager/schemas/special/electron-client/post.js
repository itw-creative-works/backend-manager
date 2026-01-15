/**
 * Schema for POST /special/electron-client
 */
module.exports = function (assistant, settings, options) {
  return {
    uid: { types: ['string'], default: undefined },
    appId: { types: ['string'], default: undefined },
    app: { types: ['string'], default: undefined },
    config: { types: ['object'], default: {} },
  };
};
