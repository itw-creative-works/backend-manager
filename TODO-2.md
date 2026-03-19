TODO
* pdate deps LIKE WF, PP, ETC

PAYMENT SYSTEM
* Ensure attribution is working (utm but also the AD ID shit like from adwords, tiktok ads, meta etc)
* ensure legacy plan RESOLVING is working

payments/reactivate
  * takes a subscription id and reactivates a cancelled subscription. this can only be done if the subscription is still within its billing period, otherwise the user would have to create a new subscription.
payments/upgrade
  * takes a subscription id and a new plan id and upgrades the user's subscription to the new plan. this can only be done if the user has an active subscription.

TEST NEWSLETTER
POST /admin/cron { id: 'daily/marketing-newsletter-generate' }

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
