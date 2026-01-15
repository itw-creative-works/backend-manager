module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  keys: {
    types: ['array', 'string'],
    default: ['clientId', 'privateKey'],
    required: false,
  },
});
