/**
 * Schema for POST /marketing/email-preferences
 *
 * Two supported modes (route decides based on user.authenticated):
 * - Authenticated (account page toggle): action ('subscribe' | 'unsubscribe'). Other fields ignored.
 * - Anonymous (HMAC link from email footer): email + asmId + sig + action ('subscribe' | 'unsubscribe').
 */
module.exports = () => ({
  email: { types: ['string'], default: undefined, required: false },
  asmId: { types: ['string', 'number'], default: undefined, required: false },
  action: { types: ['string'], default: 'unsubscribe', required: true },
  sig: { types: ['string'], default: undefined, required: false },
});
