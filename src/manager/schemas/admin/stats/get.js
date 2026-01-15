module.exports = function (assistant, settings, options) {
  return {
    update: {
      types: ['boolean', 'object'],
      default: false,
      required: false,
    },
  };
};
