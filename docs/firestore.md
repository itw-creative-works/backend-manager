# Firestore Conventions

## Path Style

Use `.doc('collectionId/documentId')` instead of `.collection('collectionId').doc('documentId')`.

## No Subcollections

**NEVER use subcollections.** All collections MUST be top-level. Use an `owner` field to associate documents with a user instead of nesting under `/users/{uid}/`.

```javascript
// CORRECT — top-level collection with owner field
await admin.firestore().doc(`items/${id}`).set({ owner: user.auth.uid, ... });

// WRONG — subcollection under users
await admin.firestore().doc(`users/${uid}/items/${id}`).set({ ... });
```

## Batch Collection Reads

**NEVER** dump an entire collection with a bare `.get()`. Always read and process in batches of ~500 using `.limit()` with `.startAfter()` cursor pagination. This applies to routes, cron jobs, standalone scripts — anywhere we query Firestore collections that could have many documents.

```javascript
const BATCH_SIZE = 500;
let lastDoc = null;
let processed = 0;

while (true) {
  let query = db.collection('items').limit(BATCH_SIZE);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snapshot = await query.get();

  if (snapshot.empty) {
    break;
  }

  for (const doc of snapshot.docs) {
    processed++;
    // process doc...
  }

  lastDoc = snapshot.docs[snapshot.docs.length - 1];
}
```

If you need a `.where()` filter, apply it before `.limit()`:

```javascript
let query = db.collection('items')
  .where('status', '==', 'active')
  .limit(BATCH_SIZE);
```

## Document Metadata

All Firestore documents must nest `created` and `updated` timestamps under a `metadata` parent field — never as top-level fields:

```javascript
// ✅ CORRECT — timestamps under metadata
const itemData = {
  id: settings.id,
  owner: user.auth.uid,
  metadata: {
    created: {
      timestamp: assistant.meta.startTime.timestamp,
      timestampUNIX: assistant.meta.startTime.timestampUNIX,
    },
    updated: {
      timestamp: assistant.meta.startTime.timestamp,
      timestampUNIX: assistant.meta.startTime.timestampUNIX,
    },
  },
};

// On update — preserve created, refresh updated
const updated = _.merge({}, existing, settings, {
  metadata: {
    created: existing.metadata.created,
    updated: {
      timestamp: assistant.meta.startTime.timestamp,
      timestampUNIX: assistant.meta.startTime.timestampUNIX,
    },
  },
});

// ❌ WRONG — top-level timestamps
const itemData = {
  created: { ... },
  updated: { ... },
};
```

In schemas, use `assistant.Manager.Settings().constant('timestampFULL')`:

```javascript
metadata: {
  created: assistant.Manager.Settings().constant('timestampFULL', { date: undefined }),
  updated: assistant.Manager.Settings().constant('timestampFULL', { date: undefined }),
},
```

## Response Format

- **Return data in the same structure as Firestore.** Do NOT reshape, rename, or restructure fields (e.g., don't convert `metadata.created.timestamp` to `createdAt`).
- For single document responses: `{ id: docId, ...docData }`
- For collection responses: `[{ id: docId, ...docData }, ...]`
- **Redaction:** Delete sensitive fields entirely from the response object. Do NOT replace them with `'[REDACTED]'`.

```javascript
// ✅ CORRECT — mirror the Firestore doc
const doc = await admin.firestore().doc(`items/${id}`).get();
return assistant.respond({ item: { id: doc.id, ...doc.data() } });

// ❌ WRONG — reshaping into a different structure
return assistant.respond({ item: { id, name: doc.data().name, createdAt: doc.data().metadata.created.timestamp } });

// ✅ CORRECT — redact by deleting
const data = doc.data();
delete data.api?.privateKey;
return assistant.respond({ item: { id: doc.id, ...data } });

// ❌ WRONG — redact by replacing
data.api.privateKey = '[REDACTED]';
```

## See also

- [routes.md](routes.md) — the route handlers doing these reads/writes
- [usage-rate-limiting.md](usage-rate-limiting.md) — the `usage` helper owns `{doc}.usage.*` fields (never write them manually)
- [cli-firestore-auth.md](cli-firestore-auth.md) — reading/writing Firestore from the terminal
