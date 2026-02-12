PAYMETN SYSTEM REFACTOR
Question
Propose a schema for storing user's subscription data in their firestore user document. Currently the user looks like this
users/{uid}
{
  auth: {
    uid: string,
    email: string,
  },
  roles: {
    admin: boolean,
  },
  ... (other stuff that is not really relevant)
}
I will be using a variety of payment processors including Stripe and PayPal, so I need a flexible way to store subscription data that can work with multiple providers.
Before inserting the subscription data, we wil need to receive the processor webhooks.
We will be keeping track of the subcsription data in the user doc AS WELL AS a dedicated subscription doc where we can have more information
Thus, the user doc doesnt need to contain the entire subscription Object, just enough to grant the user access to premium features in the backend or frontend as well as display important info in the user's account page like next billing date, plan name, status, anything else that is important.
Also, since we will be checking subscription status often, I thought it would be nice to store 2 main objects:
1. the original subscirpiton object from the payment provider, unmodified
2. a unified and standardized subscription object that we define, so that when checking subscription status we dont have to deal with the differences between payment providers (both for displaying info and for checking status/plan/etc to grant access when making requests or on the frontend)
We could store BOTH in both the user doc and the subscription doc, or only store the unified object in the user doc and both in the subscription doc.

For our standardized Object, we should be able to get the current plan and whether the subscription is active or not EXTREMELY easily. LIke a single if statement, allowing us to grant access if if the user is premium or whatever.

However, i would like it to be flexible enough so that we can show something like:
  - User is on premium plan and paid up --> grant access to premium features, show "You are Premium and your next billing date is X"
  - User is on premium plan but payment failed --> restrict access to premium features, show "Your payment failed, please update your payment method"
  - User was on premium plan but cancelled --> restrict access to premium features, show "You WERE premium but it was cancelled so now youre on Free plan"
  - User was on premium plan but cancellation is pending --> grant access to premium features, show "You are Premium until X date when your plan will be cancelled"
  - User is on trial --> grant access to premium features, show "You are on a free trial that ends on X date"
So essentially we need a way to be able to determine all of these different scenarios EASILY (SINGLE IF STATEMENT)

I know all payment proivders are different and ahve different concepts of how exaclty a subscirption is active, cancelled, past due, trialing, etc but we need to come up with a unified way of representing this data in our standardized object so that we can easily check status and display info regardless of payment provider.

Like, i i think stripe you can "cancel at period end" and thus the sub will not actually be cancelled until the end of the billing period, but paypal might be slightly different.

BEM API ENDPOINTS
* For our payment system to work, we shoudl implemnt some BEM API endpoints to create, listen for webhooks, and manage subscriptions.
* anytime there is an aciton that handles multiple payment providers, we should have the entryppoint import a file for each provider, where each provider handles the request in its own way, but STILL STANDARDIZED and similar across all providers.

backend-manager/payments/intent
* handle creating payment intents or equivalent in other providers
* various checks like
  * is the user currently subscribed? if so block
  * is the user allowed to have a trial (havent had one before)? if not block their trial
  * validate their gcaptcha token. block if invalid or missing
  * create the payment intent or equivalent at "payments-intents/{id}" in firestore

backend-manager/payments/webhook (or something similar)
* handle receiving webhooks from payment providers to update subscription status
* different file for processing each paymnt processor (returning some comon things like the event id)
* various checks like
  * verify the webhook by checking the querystring for the BEM token (same as .env BACKEND_MANAGER_KEY)
  * check for payment-webhooks/{id} doc to see if we already processed this webhook (id is provided by the payment provider in the webhook payload)
  * Immediately save the raw webhook data to "payments-webhooks/{id}" in firestore so we can return a 200 as soon as possible. THe webhook will be processed in a firestore function trigger onWrite for that doc (status === pending)

Firestore trigger for payments-webhooks/{id}
* process the webhook data and update the user's subscription data in both their user doc and their subscription doc
* various checks like
  * if status === completed, do nothing

THen, we need to plan an effective way to test all of these scenarios in our emualted testing environment which you can explore here: /Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/test
* we should be able to START with certain subscripton levels (basic/free, premium etc) and then see how events influence and change the subscription status and data in the user doc, subscription doc, webhook event doc, etc

So webhook comes in --> save immediateyl to return 200 to the payment provider --> process the webhook in a separate function trigger to update subscription data and user access (reprocess if something goes wrong, etc)
