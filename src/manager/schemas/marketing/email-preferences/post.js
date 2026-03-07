/**
 * Schema for POST /marketing/email-preferences
 */
module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
  asmId: { types: ['string', 'number'], default: undefined, required: true },
  action: { types: ['string'], default: 'unsubscribe' },
  sig: { types: ['string'], default: undefined, required: true },
});
