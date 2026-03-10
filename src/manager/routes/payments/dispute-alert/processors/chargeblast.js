/**
 * Chargeblast dispute alert processor
 * Normalizes Chargeblast webhook payloads into a standard dispute alert shape
 *
 * Chargeblast sends:
 *   id, card (full number or last4), cardBrand, amount (dollars),
 *   transactionDate ("YYYY-MM-DD HH:MM:SS"), app, processor, alerts
 */
module.exports = {
  /**
   * Normalize a Chargeblast webhook payload
   *
   * @param {object} body - Raw request body from Chargeblast
   * @returns {object} Normalized dispute alert
   */
  normalize(body) {
    if (!body.id) {
      throw new Error('Missing required field: id');
    }
    if (!body.card) {
      throw new Error('Missing required field: card');
    }
    if (!body.amount && body.amount !== 0) {
      throw new Error('Missing required field: amount');
    }
    if (!body.transactionDate) {
      throw new Error('Missing required field: transactionDate');
    }

    const cardStr = String(body.card);

    return {
      id: String(body.id),
      card: {
        last4: cardStr.slice(-4),
        brand: body.cardBrand ? String(body.cardBrand).toLowerCase() : null,
      },
      amount: parseFloat(body.amount),
      transactionDate: String(body.transactionDate).split(' ')[0], // date only, no time
      processor: body.processor ? String(body.processor).toLowerCase() : 'stripe',
    };
  },
};
