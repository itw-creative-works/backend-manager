BackendAssistant.prototype.authenticate = async function (options) {
  const self = this;

  // Shortcuts
  let admin = self.ref.admin;
  let functions = self.ref.functions;
  let req = self.ref.req;
  let res = self.ref.res;
  let data = self.request.data;
  let idToken;

  options = options || {};
  options.resolve = typeof options.resolve === 'undefined' ? true : options.resolve;

  function _resolve(user) {
    user = user || {};
    user.authenticated = typeof user.authenticated === 'undefined'
      ? false
      : user.authenticated;

    if (options.resolve) {
      self.request.user = self.resolveAccount(user);
      return self.request.user;
    } else {
      return user;
    }
  }

  if (req?.headers?.authorization && req?.headers?.authorization?.startsWith('Bearer ')) {
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
    self.log('Found "Authorization" header', idToken);
  } else if (req?.cookies?.__session) {
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;
    self.log('Found "__session" cookie', idToken);
  } else if (data.backendManagerKey || data.authenticationToken) {
    // Check with custom BEM Token
    let storedApiKey;
    try {
      // Disabled this 5/11/24 because i dont know why we would need to do functions.config() if we already have the Manager
      // const workingConfig = self.Manager?.config || functions.config();
      storedApiKey = self.Manager?.config?.backend_manager?.key || '';
    } catch (e) {
      // Do nothing
    }

    // Set idToken as working token of either backendManagerKey or authenticationToken
    idToken = data.backendManagerKey || data.authenticationToken;

    // Log the token
    self.log('Found "backendManagerKey" or "authenticationToken" parameter', {storedApiKey: storedApiKey, idToken: idToken});

    // Check if the token is correct
    if (storedApiKey && (storedApiKey === data.backendManagerKey || storedApiKey === data.authenticationToken)) {
      self.request.user.authenticated = true;
      self.request.user.roles.admin = true;
      return _resolve(self.request.user);
    }
  } else if (options.apiKey || data.apiKey) {
    const apiKey = options.apiKey || data.apiKey;
    self.log('Found "options.apiKey"', apiKey);

    if (apiKey.includes('test')) {
      return _resolve(self.request.user);
    }

    await admin.firestore().collection(`users`)
      .where('api.privateKey', '==', apiKey)
      .get()
      .then(function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
          self.request.user = doc.data();
          self.request.user.authenticated = true;
        });
      })
      .catch(function(error) {
        console.error('Error getting documents: ', error);
      });

    return _resolve(self.request.user);
  } else {
    // self.log('No Firebase ID token was able to be extracted.',
    //   'Make sure you authenticate your request by providing either the following HTTP header:',
    //   'Authorization: Bearer <Firebase ID Token>',
    //   'or by passing a "__session" cookie',
    //   'or by passing backendManagerKey or authenticationToken in the body or query');

    return _resolve(self.request.user);
  }

  // Check with firebase
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    if (options.debug) {
      self.log('Token correctly decoded', decodedIdToken.email, decodedIdToken.user_id);
    }
    await admin.firestore().doc(`users/${decodedIdToken.user_id}`)
    .get()
    .then(async function (doc) {
      if (doc.exists) {
        self.request.user = Object.assign({}, self.request.user, doc.data());
      }
      self.request.user.authenticated = true;
      self.request.user.auth.uid = decodedIdToken.user_id;
      self.request.user.auth.email = decodedIdToken.email;
      if (options.debug) {
        self.log('Found user doc', self.request.user)
      }
    })
    return _resolve(self.request.user);
  } catch (error) {
    self.error('Error while verifying Firebase ID token:', error);
    return _resolve(self.request.user);
  }
};
