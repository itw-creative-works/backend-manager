/**
 * Schema for POST /admin/cron
 */
module.exports = () => ({
  id: { types: ['string'], default: undefined, required: true },
});
