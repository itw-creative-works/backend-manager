module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
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
});
