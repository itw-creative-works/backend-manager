module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  affiliateCode: {
    types: ['string'],
    default: undefined,
    required: false,
  },
  attribution: {
    types: ['object'],
    default: {},
    required: false,
  },
  context: {
    types: ['object'],
    default: {},
    required: false,
  },
});
