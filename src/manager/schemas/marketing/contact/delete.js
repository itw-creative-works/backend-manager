/**
 * Schema for DELETE /marketing/contact
 */
module.exports = function (assistant, settings, options) {
  return {
    email: { types: ['string'], default: undefined, required: true },
    providers: { types: ['array'], default: ['sendgrid', 'beehiiv'] },
  };
};
