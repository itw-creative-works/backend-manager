TODO payments

would it be beneficial to... check the time on the event and the time in our datbase and skip if the time in oour database is nwer than the vent, indicatig that it is stale? or is this redundatn since we fetch the latest resource anyway?

next, we need to do certain things based on the CHANGE thats happening to the resource (subscription or one time) that is different that simply updating the user doc and the payments-subscriptions or payments-one-time collection. For example:
  * if a new subscription is created, we send a welcome email and grant access to the product (but this cant happen when a user fixes their payment method from a failed payment, only when a new subscription is created)
  * if a subscription is cancelled, we send a cancellation email
  * if a subscription payment fails, we send a paymetn failed "please update your payment method" email
  * if a subscription payment succeeds after previously failing, we send a "payment successful, your access has been restored" email

more endpoints to build
payments/cancel
  * takes a subscrition id and requests to cancel at the end of the billing period (not immediately). this can only be done if the user has an non cancelled subscription.
  * there should be an accompanying frontend form that asks some outboardig quetsions
    * Why are you cancelling (checkboxes + textbox) with randomzed order of the checkboes
  * after doing this, users should still be able to reactivate it
payments/manage
  * fetches the customer portal link from the payment processor and redirects the user there
  * acessible from the user's account page in biling setion
  * only accessible if the user has a non cancelled subscription

Note: * for managing and cancelling, they should be under a sinlge button/dropdown called "manage subscription".
  * it could have links to the 2 pages as items in the dropdown, or we could take them to a dedicated page (or expand an accordian) that has more information about managing it
  * we need to make it hard to cancel, buried in some info, and make it more prominent to manage it, since we want to encourage users to manage their subscription rather than cancelling it.

payments/refund
  * takes a subscription id and requests a refund to the payment processor
  * we can only refund the most recent payment and we can only refund if the subscription is cancelled.
  * we can only refund if the most recent payment in FULL was made less than 7 days ago, otherwise we can only refund a prorated amount based on how much time is left
  * i want the subscription to be immediately revoked upon refund request
  * generally, we dont modify the subscription DURING the http endpoint (such as payment intent, or cancel), rather we WAIT FOR THE WEBHOOOK. Can we do that here???

payments/reactivate
  * takes a subscription id and reactivates a cancelled subscription. this can only be done if the subscription is still within its billing period, otherwise the user would have to create a new subscription.
payments/upgrade
  * takes a subscription id and a new plan id and upgrades the user's subscription to the new plan. this can only be done if the user has an active subscription.


trial support:
when a peyment intent happens, we can only grant a trial if the user has never had a trial which involves checking the paymetns-subscriptions collection for the user to see if any exist. if any exist in any form, then we dont give a trial.
we also need a test for this

block multipl epayments
check if user has a non-cancelled sub during payment intent creation, if so, block the payment intent from being created. this will prevent multiple payments from being made at the same time and causing issues. we can check the payments-subscriptions collection for ALL usbcriptions belonging to the UID. we can use this for the trial check as well (recycle the results).
we also need a test for this



also, can you check and confirm if the usage.js sends back the users current usage in th headers? i think it does? maybe it our tests we can check to ensure that the user is probably having their usage set this way?


MANAGEMENT LINK
we need an endpoint that returns a management link for the user to manage their subscription. this will involve us looking up the users current subscription, then calling the appropriate method on the payment processor to get a management link. we can only return a management link if the user has an active subscription.


TODO

* authorizations ystem that tries to charge the card to see if its valid?
* bm_cronDaily task that doublechecks subscriptions??
  * could check existing ones eveyr month to ensure they are still vlaud and not messed up from failed webhook processing or could check every day to ensure theres no users with multiple subscirptions active simultaneously?
* bm_cronDaily yto handle disputes?
  * automatically provide evidence?

ATTRIBUTIONS!!!
// Filter attribution entries older than 30 days
const attribution = webManager.storage().get('attribution', {});
const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const filtered = {};

for (const [key, entry] of Object.entries(attribution)) {
  if (!entry?.timestamp) continue;
  if ((Date.now() - new Date(entry.timestamp).getTime()) < maxAge) {
    filtered[key] = entry;
  }
