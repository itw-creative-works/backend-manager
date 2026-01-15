/**
 * Schema for POST /handler/post
 */
module.exports = () => ({
  url: { types: ['string'], default: undefined, required: true },
  title: { types: ['string'], default: undefined, required: true },
  invoiceEmail: { types: ['string'], default: undefined },
  invoicePrice: { types: ['number'], default: undefined },
  invoiceNote: { types: ['string'], default: '' },
  sendNotification: { types: ['boolean'], default: true },
});
