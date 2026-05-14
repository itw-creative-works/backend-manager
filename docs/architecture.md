# Architecture

## Manager Class

The core `Manager` class (in `src/manager/index.js`) extends EventEmitter and orchestrates all functionality:
- Initializes Firebase Admin SDK
- Sets up built-in Cloud Functions (`bm_api`, auth events, cron)
- Provides factory methods for helper classes
- Manages configuration from multiple sources

## Dual-Mode Support

BEM supports two deployment modes:
- **Firebase Functions** (`projectType: 'firebase'`): Cloud Functions with Firebase triggers
- **Custom Server** (`projectType: 'custom'`): Express server for non-Firebase deployments

## Helper Factory Pattern

All helpers are accessed via factory methods on the Manager instance:

```javascript
Manager.Assistant({ req, res })  // Request handler
Manager.User(data)               // User properties
Manager.Analytics({ assistant }) // GA4 events
Manager.Usage()                  // Rate limiting
Manager.Middleware(req, res)     // Request pipeline
Manager.Settings()               // Schema validation
Manager.Utilities()              // Batch operations
Manager.Metadata(doc)            // Timestamps/tags
Manager.storage({ name })        // Local JSON storage (lowdb)
```
