/**
 * Schema for GET /marketing/campaign
 */
module.exports = () => ({
  id: { types: ['string'], default: '' },
  start: { types: ['string', 'number'], default: '' },
  end: { types: ['string', 'number'], default: '' },
  status: { types: ['string'], default: '' },
  type: { types: ['string'], default: '' },
  limit: { types: ['string', 'number'], default: 100 },
});
