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
    default: null,
  },
  trial: {
    types: ['boolean'],
    default: false,
  },
  verification: {
    types: ['object'],
    default: {},
  },
  attribution: {
    types: ['object'],
    default: {},
  },
  discount: {
    types: ['string'],
    default: null,
  },
  supplemental: {
    types: ['object'],
    default: {},
  },
});
