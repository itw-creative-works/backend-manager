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
});
