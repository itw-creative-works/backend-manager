/**
 * Schema for PUT /marketing/campaign
 * All fields optional except id — only provided fields are updated.
 */
module.exports = () => ({
  id: { types: ['string'], default: undefined, required: true },
  type: { types: ['string'], default: '' },

  // Content
  name: { types: ['string'], default: '' },
  subject: { types: ['string'], default: '' },
  preheader: { types: ['string'], default: '' },
  template: { types: ['string'], default: '' },
  content: { types: ['string'], default: '' },
  data: { types: ['object'], default: undefined },

  // Targeting
  lists: { types: ['array'], default: undefined },
  segments: { types: ['array'], default: undefined },
  excludeSegments: { types: ['array'], default: undefined },
  all: { types: ['boolean'], default: undefined },

  // Scheduling
  sendAt: { types: ['string', 'number'], default: '' },
  recurrence: { types: ['object'], default: undefined },

  // UTM
  utm: { types: ['object'], default: undefined },

  // Config
  sender: { types: ['string'], default: '' },
  providers: { types: ['array'], default: undefined },
  group: { types: ['string'], default: '' },
  categories: { types: ['array'], default: undefined },
});
