module.exports = function (assistant, settings, options) {
  return {
    uid: {
      types: ['string'],
      default: undefined,
      required: false,
    },
    keys: {
      types: ['array', 'string'],
      default: ['clientId', 'privateKey'],
      required: false,
    },
  };
};
