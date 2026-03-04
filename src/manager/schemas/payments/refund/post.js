/**
 * Schema: POST /payments/refund
 * Validates subscription refund parameters
 */
module.exports = () => ({
  reason: {
    types: ['string'],
    required: true,
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
