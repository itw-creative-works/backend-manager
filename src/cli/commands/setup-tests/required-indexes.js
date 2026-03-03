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
];
