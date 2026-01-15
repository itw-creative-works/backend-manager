module.exports = function (assistant, settings, options) {
  return {
    uid: {
      types: ['string'],
      default: undefined,
      required: false,
    },
    defaultsPath: {
      types: ['string'],
      default: '',
      required: false,
    },
    existingSettings: {
      types: ['object'],
      default: {},
      required: false,
    },
    newSettings: {
      types: ['object'],
      default: {},
      required: false,
    },
  };
};
