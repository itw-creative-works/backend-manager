module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  id: {
    types: ['string'],
    default: 'app',
    required: false,
  },
});
