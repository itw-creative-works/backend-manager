module.exports = function (assistant, settings, options) {
  return {
    queries: {
      types: ['array'],
      default: [],
      required: false,
    },
  };
};
