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
  // Bypass route-level guards (e.g. 24-hour subscription age). Used by tests and internal callers.
  skipGuards: {
    types: ['boolean'],
    default: false,
  },
});
