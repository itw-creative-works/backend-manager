/**
 * Schema for DELETE /marketing/contact
 */
module.exports = () => ({
  email: { types: ['string'], default: undefined, required: true },
});
