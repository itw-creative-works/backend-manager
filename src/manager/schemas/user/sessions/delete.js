module.exports = function (assistant, settings, options) {
  return {
    uid: {
      types: ['string'],
      default: undefined,
      required: false,
    },
    id: {
      types: ['string'],
      default: 'app',
      required: false,
    },
  };
};
