module.exports = () => ({
  rating: {
    types: ['string'],
    default: undefined,
    required: true,
  },
  positive: {
    types: ['string'],
    default: '',
    required: false,
  },
  negative: {
    types: ['string'],
    default: '',
    required: false,
  },
  comments: {
    types: ['string'],
    default: '',
    required: false,
  },
});
