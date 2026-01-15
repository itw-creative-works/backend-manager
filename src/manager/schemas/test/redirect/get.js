module.exports = function (assistant, settings, options) {
  return {
    url: {
      types: ['string'],
      default: 'https://itwcreativeworks.com',
      required: false,
    },
  };
};
