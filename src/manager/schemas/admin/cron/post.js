/**
 * Schema for POST /admin/cron
 */
module.exports = function (assistant, settings, options) {
  return {
    id: { types: ['string'], default: undefined, required: true },
  };
};
