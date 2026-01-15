module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  provider: {
    types: ['string'],
    default: undefined,
    required: true,
  },
  state: {
    types: ['string'],
    default: 'authorize',
    required: false,
  },
  redirect: {
    types: ['boolean'],
    default: true,
    required: false,
  },
  referrer: {
    types: ['string'],
    default: undefined,
    required: false,
  },
  serverUrl: {
    types: ['string'],
    default: undefined,
    required: false,
  },
  redirect_uri: {
    types: ['string'],
    default: undefined,
    required: false,
  },
  scope: {
    types: ['array', 'string'],
    default: [],
    required: false,
  },
  code: {
    types: ['string'],
    default: undefined,
    required: false,
  },
  access_type: {
    types: ['string'],
    default: 'offline',
    required: false,
  },
  prompt: {
    types: ['string'],
    default: 'consent',
    required: false,
  },
  include_granted_scopes: {
    types: ['string', 'boolean'],
    default: 'true',
    required: false,
  },
  response_type: {
    types: ['string'],
    default: 'code',
    required: false,
  },
  removeInvalidTokens: {
    types: ['boolean'],
    default: true,
    required: false,
  },
  authenticationToken: {
    types: ['string'],
    default: undefined,
    required: false,
  },
});
