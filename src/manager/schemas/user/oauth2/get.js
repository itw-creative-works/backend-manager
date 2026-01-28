module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  provider: {
    types: ['string'],
    required: true,
  },
  action: {
    types: ['string'],
    default: 'authorize',
    enum: ['authorize', 'status'],
    required: false,
  },
  redirect: {
    types: ['boolean'],
    default: true,
    required: false,
  },
  removeInvalidTokens: {
    types: ['boolean'],
    default: true,
    required: false,
  },
});
