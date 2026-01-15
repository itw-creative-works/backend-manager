module.exports = function (assistant, settings, options) {
  return {
    uid: {
      types: ['string'],
      default: undefined,
      required: false,
    },
  };
};
