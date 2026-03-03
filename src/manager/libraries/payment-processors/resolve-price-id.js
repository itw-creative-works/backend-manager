/**
 * Resolve the Stripe price ID from a product config object
 *
 * @param {object} product - Product object from config (must have .prices)
 * @param {string} productType - 'subscription' or 'one-time'
 * @param {string} frequency - 'monthly', 'annually', etc. (subscriptions) — ignored for one-time
 * @returns {string} Stripe price ID
 * @throws {Error} If no price ID found
 */
module.exports = function resolvePriceId(product, productType, frequency) {
  const key = productType === 'subscription' ? frequency : 'once';
  const priceId = product.prices?.[key]?.stripe;

  if (!priceId) {
    throw new Error(`No Stripe price found for ${product.id}/${key}`);
  }

  return priceId;
};
