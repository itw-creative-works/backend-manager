/**
 * Schema: POST /payments/intent
 * Validates intent creation parameters
 */
module.exports = () => ({
  processor: {
    types: ['string'],
    required: true,
  },
  productId: {
    types: ['string'],
    required: true,
  },
  frequency: {
    types: ['string'],
    required: true,
  },
  trial: {
    types: ['boolean'],
    default: false,
  },
});
