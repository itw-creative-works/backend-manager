module.exports = () => ({
  path: {
    types: ['string'],
    default: undefined,
    required: true,
  },
  document: {
    types: ['object', 'string', 'number', 'boolean', 'array'],
    default: {},
    required: false,
  },
});
