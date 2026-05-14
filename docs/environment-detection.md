# Environment Detection

```javascript
assistant.isDevelopment()  // true when ENVIRONMENT !== 'production' or in emulator
assistant.isProduction()   // true when ENVIRONMENT === 'production'
assistant.isTesting()      // true when running tests (via npx mgr test)
```
