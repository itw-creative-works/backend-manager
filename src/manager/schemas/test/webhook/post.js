module.exports = function (assistant, settings, options) {
  return {
    delay: {
      types: ['number'],
      default: 0,
      required: false,
    },
    status: {
      types: ['number'],
      default: 200,
      required: false,
    },
    response: {
      types: ['object', 'string'],
      default: {},
      required: false,
    },
  };
};
