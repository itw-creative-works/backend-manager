if (options.setupFunctions) {
  // exporter.bm_api =
  // self.libraries.functions
  // .runWith({memory: '256MB', timeoutSeconds: 60})
  // .https.onRequest(async (req, res) => {
  //   const Module = (new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, });
  //
  //   return self._preProcess(Module)
  //   .then(r => Module.main())
  //   .catch(e => {
  //     self.assistant.error(e, {environment: 'production'});
  //     return res.status(500).send(e.message);
  //   });
  // });
  exporter.bm_api =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    return self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, }))
  });

  if (options.setupFunctionsLegacy) {
    exporter.bm_signUpHandler =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/actions/sign-up-handler.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    // Admin
    exporter.bm_createPost =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/admin/create-post.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_firestoreWrite =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/admin/firestore-write.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_getStats =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 420})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/admin/get-stats.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_sendNotification =
    self.libraries.functions
    .runWith({memory: '1GB', timeoutSeconds: 420})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/admin/send-notification.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_query =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/admin/query.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_createPostHandler =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/actions/create-post-handler.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_generateUuid =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/actions/generate-uuid.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    // Test
    exporter.bm_test_authenticate =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${test}/authenticate.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_test_createTestAccounts =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${test}/create-test-accounts.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_test_webhook =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${test}/webhook.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });
  }

  // Events
  exporter.bm_authOnCreate =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .auth.user().onCreate(async (user) => {
    const Module = require(`${core}/events/auth/on-create.js`);
    Module.init(self, { user: user });

    return self._preProcess(Module)
    .then(r => Module.main())
    .catch(e => {
      self.assistant.error(e, {environment: 'production'});
    });
  });

  exporter.bm_authOnDelete =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .auth.user().onDelete(async (user) => {
    const Module = require(`${core}/events/auth/on-delete.js`);
    Module.init(self, { user: user });

    return self._preProcess(Module)
    .then(r => Module.main())
    .catch(e => {
      self.assistant.error(e, {environment: 'production'});
    });
  });

  exporter.bm_subOnWrite =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .firestore
  .document('notifications/subscriptions/all/{token}')
  .onWrite(async (change, context) => {
    const Module = require(`${core}/events/firestore/on-subscription.js`);
    Module.init(self, { change: change, context: context, });

    return self._preProcess(Module)
    .then(r => Module.main())
    .catch(e => {
      self.assistant.error(e, {environment: 'production'});
    });
  });
}
