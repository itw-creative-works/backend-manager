/**
 * Schema for POST /marketing/contact
 */
const { DEFAULT_PROVIDERS } = require('../../../libraries/email/constants.js');

module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
  firstName: { types: ['string'], default: '' },
  lastName: { types: ['string'], default: '' },
  source: { types: ['string'], default: 'unknown' },
  tags: { types: ['array'], default: [] },
  providers: { types: ['array'], default: DEFAULT_PROVIDERS },
  skipValidation: { types: ['boolean'], default: false },
  'g-recaptcha-response': { types: ['string'], default: undefined },
});
