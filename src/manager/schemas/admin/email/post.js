/**
 * Schema for POST /admin/email
 *
 * Recipients (to, cc, bcc) accept flexible formats:
 * - Email string: "user@example.com"
 * - UID string (no @): "abc123" — auto-fetches user doc from Firestore
 * - Email object: { email: "user@example.com", name: "John" }
 * - Array of any of the above
 */
module.exports = () => ({
  to: { types: ['array', 'string', 'object'], default: [] },
  cc: { types: ['array', 'string', 'object'], default: [] },
  bcc: { types: ['array', 'string', 'object'], default: [] },
  from: { types: ['object'], default: undefined },
  replyTo: { types: ['string'], default: undefined },
  sender: { types: ['string'], default: undefined },
  subject: { types: ['string'], default: undefined },
  template: { types: ['string'], default: 'default' },
  group: { types: ['number', 'string'], default: undefined },
  sendAt: { types: ['number', 'string'], default: undefined },
  data: { types: ['object'], default: {} },
  categories: { types: ['array'], default: [] },
  copy: { types: ['boolean'], default: undefined },
  html: { types: ['string'], default: undefined },
});
