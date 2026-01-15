module.exports = function (assistant, settings, options) {
  return {
    path: {
      types: ['string'],
      default: undefined,
      required: true,
    },
  };
};
