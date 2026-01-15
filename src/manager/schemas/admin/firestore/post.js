module.exports = () => ({
  path: {
    types: ['string'],
    default: undefined,
    required: true,
  },
  document: {
    types: ['object'],
    default: {},
    required: false,
  },
  merge: {
    types: ['boolean'],
    default: true,
    required: false,
  },
  metadataTag: {
    types: ['string'],
    default: 'admin/firestore',
    required: false,
  },
});
