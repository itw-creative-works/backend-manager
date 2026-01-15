/**
 * Schema for DELETE /marketing/contact
 */
module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
  providers: { types: ['array'], default: ['sendgrid', 'beehiiv'] },
});
