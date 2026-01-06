????
  // Attach assistant to req and res
  if (ref.req && ref.res) {
    ref.req.assistant = self;
    ref.res.assistant = self;
  }

    console.log('*** err', err);
    console.log('*** req.assistant', req.assistant);
    console.log('*** res.assistant', res.assistant);


# PAYMETNS
https://github.com/invertase/stripe-firebase-extensions/tree/next/firestore-stripe-payments

# Make new BEM API using middleware system

# BEM Test
* Create test accounts (admin, free user, user with paid plan)
* Run tests to ensure each account has correct access to features

BEM
  * Teach it how to mock requests and use test user's SECRET API KEYS to authenticate requests
  * BEM should create a few test accounts: basic, then one for each plan level


ADD HEALTHCHECK TO BEM!!!
  ✗ https://api.clockii.com/backend-manager?command=healthcheck → fetch failed
