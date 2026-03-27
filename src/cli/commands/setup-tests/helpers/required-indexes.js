/**
 * Required Firestore compound indexes for BEM routes
 * These are automatically added to firestore.indexes.json during `npx bm setup`
 */
module.exports = [
  // All /user/data-request routes — most recent request by created date
  // Serves: .where('owner', '==', uid).orderBy('metadata.created.timestampUNIX', 'desc')
  {
    collectionGroup: 'data-requests',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'owner', order: 'ASCENDING' },
      { fieldPath: 'metadata.created.timestampUNIX', order: 'DESCENDING' },
    ],
  },

  // POST /payments/intent — trial eligibility check
  // Query: .where('owner', '==', uid).where('type', '==', 'subscription')
  {
    collectionGroup: 'payments-orders',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'owner', order: 'ASCENDING' },
      { fieldPath: 'type', order: 'ASCENDING' },
    ],
  },

  // POST /admin/notification — send to filtered users
  // Query: .where('tags', 'array-contains-any', tags).where('owner', '==', owner)
  {
    collectionGroup: 'notifications',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'tags', arrayConfig: 'CONTAINS' },
      { fieldPath: 'owner', order: 'ASCENDING' },
    ],
  },

  // Abandoned cart cron — find pending carts due for reminders
  // Query: .where('status', '==', 'pending').where('nextReminderAt', '<=', nowUNIX)
  {
    collectionGroup: 'payments-carts',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'nextReminderAt', order: 'ASCENDING' },
    ],
  },

  // Marketing campaigns cron — find pending campaigns ready to send
  // Query: .where('status', '==', 'pending').where('sendAt', '<=', now)
  {
    collectionGroup: 'marketing-campaigns',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'sendAt', order: 'ASCENDING' },
    ],
  },

  // Admin dashboard — active paid subscriber count
  // Serves: .where('subscription.status', '==', 'active').where('subscription.product.id', '!=', 'basic')
  {
    collectionGroup: 'users',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'subscription.status', order: 'ASCENDING' },
      { fieldPath: 'subscription.product.id', order: 'ASCENDING' },
    ],
  },

  // GET /marketing/campaign — list by type + sendAt range
  // Query: .where('type', '==', type).where('sendAt', '>=', start).where('sendAt', '<=', end)
  {
    collectionGroup: 'marketing-campaigns',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'type', order: 'ASCENDING' },
      { fieldPath: 'sendAt', order: 'ASCENDING' },
    ],
  },
];
