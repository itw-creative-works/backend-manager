/**
 * Schema for POST /admin/backup
 */
module.exports = function (assistant, settings, options) {
  return {
    deletionRegex: { types: ['string'], default: undefined },
  };
};
