/**
 * Schema for POST /admin/payment
 */
module.exports = function (assistant, settings, options) {
  return {
    payload: { types: ['object'], default: {} },
  };
};
