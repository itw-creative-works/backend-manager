/**
 * Schema for POST /admin/hook
 */
module.exports = () => ({
  path: { types: ['string'], default: undefined, required: true },
});
