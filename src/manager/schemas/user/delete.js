module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  reason: {
    types: ['string'],
    default: '',
    max: 500,
  },
});
