/**
 * Schema: POST /payments/portal
 * Validates billing portal session parameters
 */
module.exports = () => ({
  returnUrl: {
    types: ['string'],
    default: null,
  },
});
