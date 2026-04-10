TODO
* pdate deps LIKE WF, PP, ETC

PAYMENT SYSTEM
* Ensure attribution is working (utm but also the AD ID shit like from adwords, tiktok ads, meta etc)
* ensure legacy plan RESOLVING is working

payments/reactivate
  * takes a subscription id and reactivates a cancelled subscription. this can only be done if the subscription is still within its billing period, otherwise the user would have to create a new subscription.
payments/upgrade
  * takes a subscription id and a new plan id and upgrades the user's subscription to the new plan. this can only be done if the user has an active subscription.

I'd call that cancellation-reversed — it pairs naturally with the existing cancellation-requested transition and clearly communicates the action (they reversed/undid the pending cancellation).

on the email we send, for payment recovered what is the category
Let me check the handler.

Read payment-recovered.js
The category is order/payment-recovered (line 13).

TODO-2.md
waht about when they request a cancel
Read cancellation-requested.js
The category is order/cancellation-requested (line 13).

----
add a dedicated BEM JSON field for usage to reset
  * this way we can have clear LIMITS with their definitions like
  * [
    {
      name: 'credits'
      reset: true,
    },
    {
      name: 'agents',
      reset: false,
    }
  ]
  * mirrors: [
    {
      collection: 'agents',
      fields: ['usage.credits.daily', 'runs.replies.daily],
    }
  ]

---
MIRROR settigns in BEM JSON so that usage reset can properly get MIRRED DOCS liek slapform forms or chatsy agents DOCS

---
GHOSTII REVAMP
* better logic for generating posts. better model? claude?

---- MCP
* ability for consuming prjec to specify MCP functions

-------
UPSELL
* products in BEM can have an UPSELL where you link another product ID and it allows you to add it to your cart OR shows you after checkout?

-------
USER OBJECT UPDGRADE --> INSTANCE?

const User = require('backend-manager/src/manager/helpers/user');
+
User.resolveSubscription(self.request.user);
-->
one object that cna do resolveSubscription(), getAccount(), etc

since you changed some things, do all tests in all projects align still?

after that, udpate README, CLAUDE.md and ANY TOPLEVLE CLAUDE SKILLS so that we never make this mistake again

including

---------

TEST NEWSLETTER
POST /admin/cron { id: 'daily/marketing-newsletter-generate' }


SIGNUP HANDLER
Here are the instructions for BEM:

Update updateReferral() in sign-up.js to resolve all legacy affiliate code formats:

The affiliateCode value coming from the client could be in 3 formats:

Format	Example	How to resolve
Affiliate code (7-14 alphanumeric)	rmUKlC4z1	Query users where affiliate.code == value (current behavior)
UID (28 chars)	6sNjQFxTsObA73D8lkF01gcWdP92	Direct doc lookup: users/{value}
Base64 email (e.g. cG9ldH...Lm_2)	cG9ldHJ5aW5hY3Rpb24yMDE4QGdtYWlsLmNvbQ_2	Strip _\d+ suffix, base64-decode, query users where auth.email == decoded
Any other format → ignore (resolve with no referrer).

The resolution logic should go at the top of updateReferral(), before the current where('affiliate.code', '==', affiliateCode) query. Try each format in order:

If affiliateCode matches /^[0-9a-zA-Z_-]{7,14}$/ → query by affiliate.code (current path)
Else if affiliateCode.length === 28 → direct doc get users/{affiliateCode}, use that as the referrer
Else try base64 decode: strip trailing _\d+, decode, if result contains @ → query by auth.email
Else → log and return (unrecognized format)
Once the referrer doc is found (by any method), the rest stays the same: push to affiliate.referrals.

* if the usage was used and the user is actuall authenticated (uid, not just an admin or unauthed user),
  * set the user's context (ip, location, etc)

Payment attribution
* can you ensure the the user's attribution (utm etc) is assocaited with the purchase
* mostly i am referring to the payent events sent to GA4, tiktok, meta
* i think we should make it so if the attribution was set less than 30 days ago (the date is in the attribution) then it counts
* it shouldbe attached to the payments-orders and then ALL FUTURE EVENTS should send that (thats a good idea right??)

Payment disputes
* automatic dispute handling
* during bm_cron daily, we should check for open disputes for pypal stripe etc... we should then FILL THEM WITH INFORMATION USEFUL FOR WINNING
* we should attach USAGE LOGS, IP logs, etc. you should take inspiration from my previous attmept at this (/Users/ian/Developer/Repositories/ITW-Creative-Works/subscription-profile-sync/main/disputes)
* HOWEVER, i know for a fact i got a lot of it wrong. so JUST USE AS INSPO, you should recreate it full
