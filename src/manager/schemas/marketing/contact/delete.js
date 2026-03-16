/**
 * Schema for DELETE /marketing/contact
 */
const { DEFAULT_PROVIDERS } = require('../../../libraries/email/constants.js');

module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
  providers: { types: ['array'], default: DEFAULT_PROVIDERS },
});
