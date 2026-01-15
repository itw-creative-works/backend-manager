module.exports = function (assistant, settings, options) {
  return {
    uid: {
      types: ['string'],
      default: undefined,
      required: false,
    },
    affiliateCode: {
      types: ['string'],
      default: undefined,
      required: false,
    },
    attribution: {
      types: ['object'],
      default: {},
      required: false,
    },
    context: {
      types: ['object'],
      default: {},
      required: false,
    },
  };
};
