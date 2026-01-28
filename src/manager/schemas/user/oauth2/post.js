module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  provider: {
    types: ['string'],
    required: false,  // Not required for tokenize (provider comes from encrypted state)
  },
  action: {
    types: ['string'],
    default: 'tokenize',
    enum: ['tokenize', 'refresh'],
    required: false,
  },
  code: {
    types: ['string'],
    required: false,  // Required for tokenize
  },
  encryptedState: {
    types: ['string'],
    required: false,  // Required for tokenize
  },
});
