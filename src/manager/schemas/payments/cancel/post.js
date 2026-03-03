/**
 * Schema: POST /payments/cancel
 * Validates subscription cancellation parameters
 */
module.exports = () => ({
  reason: {
    types: ['string'],
    default: null,
  },
  feedback: {
    types: ['string'],
    default: null,
  },
  confirmed: {
    types: ['boolean'],
    required: true,
  },
});
