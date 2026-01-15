module.exports = function (assistant, settings, options) {
  return {
    rating: {
      types: ['string'],
      default: undefined,
      required: true,
    },
    like: {
      types: ['string'],
      default: '',
      required: false,
    },
    dislike: {
      types: ['string'],
      default: '',
      required: false,
    },
    comments: {
      types: ['string'],
      default: '',
      required: false,
    },
  };
};
