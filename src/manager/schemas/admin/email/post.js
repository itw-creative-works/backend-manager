/**
 * Schema for POST /admin/email
 */
module.exports = () => ({
  to: { types: ['array'], default: [] },
  cc: { types: ['array'], default: [] },
  bcc: { types: ['array'], default: [] },
  from: { types: ['object'], default: undefined },
  replyTo: { types: ['string'], default: undefined },
  subject: { types: ['string'], default: undefined },
  template: { types: ['string'], default: 'd-b7f8da3c98ad49a2ad1e187f3a67b546' },
  group: { types: ['number'], default: 24077 },
  sendAt: { types: ['number'], default: undefined },
  user: { types: ['object'], default: {} },
  data: { types: ['object'], default: {} },
  categories: { types: ['array'], default: [] },
  copy: { types: ['boolean'], default: true },
  ensureUnique: { types: ['boolean'], default: true },
  html: { types: ['string'], default: undefined },
});
