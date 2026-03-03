/**
 * Schema for POST /admin/email
 *
 * Recipients (to, cc, bcc) accept flexible formats:
 * - String email: "user@example.com"
 * - UID string: "uid:abc123" (auto-resolves from Firestore)
 * - Object: { email: "user@example.com", name: "John" }
 * - Array of any of the above
 */
module.exports = () => ({
  to: { types: ['array', 'string', 'object'], default: [] },
  cc: { types: ['array', 'string', 'object'], default: [] },
  bcc: { types: ['array', 'string', 'object'], default: [] },
  from: { types: ['object'], default: undefined },
  replyTo: { types: ['string'], default: undefined },
  subject: { types: ['string'], default: undefined },
  template: { types: ['string'], default: undefined },
  group: { types: ['number'], default: undefined },
  sendAt: { types: ['number', 'string'], default: undefined },
  user: { types: ['object'], default: {} },
  data: { types: ['object'], default: {} },
  categories: { types: ['array'], default: [] },
  copy: { types: ['boolean'], default: undefined },
  html: { types: ['string'], default: undefined },
});
