/**
 * Schema for POST /marketing/campaign
 */
module.exports = () => ({
  // Identity
  id: { types: ['string'], default: '' },
  type: { types: ['string'], default: 'email' },

  // Content
  name: { types: ['string'], default: undefined, required: true },
  subject: { types: ['string'], default: undefined, required: true },
  preheader: { types: ['string'], default: '' },
  template: { types: ['string'], default: 'default' },
  content: { types: ['string'], default: '' },
  data: { types: ['object'], default: {} },

  // Targeting
  lists: { types: ['array'], default: [] },
  segments: { types: ['array'], default: [] },
  excludeSegments: { types: ['array'], default: [] },
  all: { types: ['boolean'], default: false },

  // Scheduling
  sendAt: { types: ['string', 'number'], default: '' },
  recurrence: { types: ['object'], default: undefined },  // { pattern: 'weekly'|'monthly'|'quarterly'|'yearly'|'daily', hour?, day?, month? }

  // UTM
  utm: { types: ['object'], default: {} },

  // Config
  sender: { types: ['string'], default: 'marketing' },
  providers: { types: ['array'], default: [] },
  group: { types: ['string'], default: '' },
  categories: { types: ['array'], default: [] },
});
