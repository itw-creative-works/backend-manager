/**
 * Schema for POST /marketing/contact
 */
module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
  firstName: { types: ['string'], default: '' },
  lastName: { types: ['string'], default: '' },
  source: { types: ['string'], default: 'unknown' },
  tags: { types: ['array'], default: [] },
  providers: { types: ['array'], default: ['sendgrid', 'beehiiv'] },
  skipValidation: { types: ['boolean'], default: false },
  'g-recaptcha-response': { types: ['string'], default: undefined },
});
