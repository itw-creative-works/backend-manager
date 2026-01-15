/**
 * Schema for POST /admin/backup
 */
module.exports = () => ({
  deletionRegex: { types: ['string'], default: undefined },
});
