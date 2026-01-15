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

TODO

# TEST REWRRK
btw... the account.json needs to be removed. remove it from BEM and the consumong project. when we make our test system, we DO NOT NEED TO STORE THE ACCOUBT IN A JSON file. we just need a source of truth in BEM for what uid/emails to look for

need a "projectScripts" that creates the npm start, npm test, etc scripts in the consuming project.

during test run, we need to check that the test accounts exist. we also need to ALWAYS reset them at the begining of the run to ensure they are in the proper format, specifically by resetting their usage, roles, amd subscriptipn

needa new account type that we can change the subscription level of to test the sub events? maybe _test-upgrade that starts free and we test how it progresses from free to paid to canceled?

# Use gitignore from backend-manager-tempalte

# CLEAN
having different ID and UID is messy and annoying, just make it the same
  admin: {
    id: 'admin',
    uid: '_test-admin',
    email: '_test.admin@{domain}',

should be "admin" for ALL


# TODO
Update deps
Remove unused deps like
  * node-fetch

# MOVE LEGACY BEM INDIVIDUAL FUNCTIONS TO AN _OLD FOLDER
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/core/actions/create-post-handler.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/core/actions/generate-uuid.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/core/actions/sign-up-handler.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/test
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/core/admin

# Things to deprecate
* api manager

# Email
Move the sendEmail function to HERE instead of calling ITW

# BEM TESTS
# User Auth rules
* User can only access their own user doc
  * fails when trying to access another user's doc
  * succeeds when accessing their own,
  * fails when NOT authed
  * fails when trying to perform an admin action (can create/use the test:admin http event to test this)
  * fails when a user tries to write to a restricted field/key like roles, subscription, usage, etc (SEE RULES)
  * Any other rules: /Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/templates/firestore.rules
* User can delete their own user doc (can use _test-delete via user:delete http event)
  * fails when trying to delete another user's doc
  * succeeds when deleting their own,
  * fails when NOT authed

# Signup Flow
* Create a referrer user and a referred user then use user:signup http event on the referred user to test that
  * the referral code works and the bonus is applied to the referrer
  * something is added to the account to denote it received the signup event??? not sure
  * context data is added to the referred user's account
  * a second signup event

# Test
* test:authenticate http event
  * success when valid uid
  * fail when invalid uid
  * fail when no uid
* test admin
  * all admin functions fail when not authed as admin
  * test each admin function

# Usage
* Using an account with a specific plan, test that the usage limits are enforced
  * success if user has access to the plan
  * success if the user is within the usage limits
  * fail if the user exceeds the usage limits
  * fail if the user is on a plan that does not allow usage (free plan)
  * successful usage should increment the usage count

# Events
* trigger cron daily
  * it should reset temp usage for all users
  * reset userdocs to current usage = 0

# Payment
* test subscription upgrade flow via http event
  * start with free plan
  * upgrade to paid plan
  * verify plan is updated
  * verify usage limits are updated
  * downgrade back to free plan
  * verify plan is updated
  * verify usage limits are updated

# BEM API
# Admin
* All functions need to fail when not authed as admin
* then test each one

# Advanced
* test sub accounts

# payment system
* dont store a "resolved" status, but make a universal library that frontend and backend use to determine whther a user has access to a plan currently

# New bem api and test to make
test:usage
* the fnction itself just utilizes the usage API to increment an arbitrary usage item

the test should check the usage storage and ensure that it was incremented successfully

then, we need to test the bm_cronDaily function to ensure that it does its things like clearing the usage storage properly



# Rebuild the account creation flow
* consider useing ID platform to just do beforeCreate so we dont have to handle
  * onCreate fires late (user:signup http event needs to poll for existence)
  * use a flag instead of age so that we can be sure its a new user and NOT re-do it when they link a new provider

# MIGRATIONS
## user
affiliate: {
  referrer: affiliateCode,
},
-->
attribution.affiliate.code

## notifications
uid --> owner (uid stil though)
also the weird nested accident where it was /notifications/{uid}/notifications/{token} --> /notifications/{token}




## OLD TESTS
    "_test": "npm run prepare && ./node_modules/mocha/bin/mocha test/ --recursive --timeout=10000",
    "test": "./node_modules/mocha/bin/mocha test/ --recursive --timeout=10000",
    "test:cli": "./node_modules/mocha/bin/mocha test/cli-commands.test.js --timeout=10000",
    "test:usage": "./node_modules/mocha/bin/mocha test/usage.js --timeout=10000",
    "test:payment-resolver": "./node_modules/mocha/bin/mocha test/payment-resolver/index.js --timeout=10000",
    "test:user": "./node_modules/mocha/bin/mocha test/user.js --timeout=10000",
    "test:ai": "./node_modules/mocha/bin/mocha test/ai/index.js --timeout=10000",
