const powertools = require('node-powertools');
const transitions = require('./transitions/index.js');
const { trackPayment } = require('./analytics.js');

/**
 * Firestore trigger: payments-webhooks/{eventId} onWrite
 *
 * Processes pending webhook events:
 * 1. Loads the processor library
 * 2. Fetches the latest resource from the processor API (not the stale webhook payload)
 * 3. Branches on event.category to transform + write:
 *    - subscription → toUnifiedSubscription → users/{uid}.subscription + payments-orders/{orderId}
 *    - one-time    → toUnifiedOneTime → payments-orders/{orderId}
 * 4. Detects state transitions and dispatches handler files (non-blocking)
 * 5. Marks the webhook as completed
 */
module.exports = async ({ assistant, change, context }) => {
  const Manager = assistant.Manager;
  const admin = Manager.libraries.admin;

  const dataAfter = change.after.data();

  // Short-circuit: deleted doc or non-pending status
  if (!dataAfter || dataAfter.status !== 'pending') {
    return;
  }

  const eventId = context.params.eventId;
  const webhookRef = admin.firestore().doc(`payments-webhooks/${eventId}`);

  // Set status to processing
  await webhookRef.set({ status: 'processing' }, { merge: true });

  // Hoisted so orderId is available in catch block for audit trail
  let orderId = null;

  try {
    const processor = dataAfter.processor;
    let uid = dataAfter.owner;
    const raw = dataAfter.raw;
    const eventType = dataAfter.event?.type;
    const category = dataAfter.event?.category;
    const resourceType = dataAfter.event?.resourceType;
    const resourceId = dataAfter.event?.resourceId;

    assistant.log(`Processing webhook ${eventId}: processor=${processor}, eventType=${eventType}, category=${category}, resourceType=${resourceType}, resourceId=${resourceId}, uid=${uid || 'null'}`);

    // Validate category
    if (!category) {
      throw new Error(`Webhook event has no category — cannot process`);
    }

    // Load the shared library for this processor
    let library;
    try {
      library = require(`../../../libraries/payment/processors/${processor}.js`);
    } catch (e) {
      throw new Error(`Unknown processor library: ${processor}`);
    }

    // Fetch the latest resource from the processor API
    // This ensures we always work with the most current state, not stale webhook data
    const rawFallback = raw.data?.object || {};
    const resource = await library.fetchResource(resourceType, resourceId, rawFallback, { admin, eventType, config: Manager.config });

    assistant.log(`Fetched resource: type=${resourceType}, id=${resourceId}, status=${resource.status || 'unknown'}`);

    // Resolve UID from the fetched resource if not available from webhook parse
    // This handles events like PAYMENT.SALE where the Sale object doesn't carry custom_id
    // but the parent subscription (fetched via fetchResource) does
    if (!uid && library.getUid) {
      uid = library.getUid(resource);
      assistant.log(`UID resolved from fetched resource: uid=${uid || 'null'}, processor=${processor}, resourceType=${resourceType}`);

      // Update the webhook doc with the resolved UID so it's persisted for debugging
      if (uid) {
        await webhookRef.set({ owner: uid }, { merge: true });
      }
    }

    // Fallback: resolve UID from the hosted page's pass_thru_content
    // Chargebee hosted page checkouts don't forward subscription[meta_data] to the subscription,
    // but pass_thru_content is stored on the hosted page and contains our UID + orderId
    let resolvedFromPassThru = false;
    let passThruOrderId = null;
    if (!uid && library.resolveUidFromHostedPage) {
      const passThruResult = await library.resolveUidFromHostedPage(resourceId, assistant);
      if (passThruResult) {
        uid = passThruResult.uid;
        passThruOrderId = passThruResult.orderId || null;
        resolvedFromPassThru = true;
        assistant.log(`UID resolved from hosted page pass_thru_content: uid=${uid}, orderId=${passThruOrderId}, resourceId=${resourceId}`);

        await webhookRef.set({ owner: uid }, { merge: true });
      }
    }

    // Validate UID — must have one by now
    if (!uid) {
      throw new Error(`Webhook event has no UID — could not extract from webhook parse, fetched ${resourceType} resource, or hosted page pass_thru_content`);
    }

    // Backfill: if UID was resolved from pass_thru_content, set meta_data on the subscription
    // so future webhooks (renewals, cancellations) can resolve the UID directly
    if (resolvedFromPassThru && resourceType === 'subscription' && library.setMetaData) {
      library.setMetaData(resource, { uid, orderId: passThruOrderId })
        .then(() => assistant.log(`Backfilled meta_data on subscription ${resourceId} + customer: uid=${uid}, orderId=${passThruOrderId}`))
        .catch((e) => assistant.error(`Failed to backfill meta_data on ${resourceType} ${resourceId}: ${e.message}`));
    }

    // Build timestamps
    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });
    const webhookReceivedUNIX = dataAfter.metadata?.created?.timestampUNIX || nowUNIX;

    // Extract orderId from resource (processor-agnostic)
    // Falls back to pass_thru_content orderId when meta_data wasn't available on the resource
    orderId = library.getOrderId(resource) || passThruOrderId;

    // Process the payment event (subscription or one-time)
    if (category !== 'subscription' && category !== 'one-time') {
      throw new Error(`Unknown event category: ${category}`);
    }

    const transitionName = await processPaymentEvent({ category, library, resource, resourceType, uid, processor, eventType, eventId, resourceId, orderId, now, nowUNIX, webhookReceivedUNIX, assistant, raw });

    // Mark webhook as completed (include transition name for auditing/testing)
    await webhookRef.set({
      status: 'completed',
      owner: uid,
      orderId: orderId,
      transition: transitionName,
      metadata: {
        completed: {
          timestamp: now,
          timestampUNIX: nowUNIX,
        },
      },
    }, { merge: true });

    assistant.log(`Webhook ${eventId} completed`);
  } catch (e) {
    assistant.error(`Webhook ${eventId} failed: ${e.message}`, e);

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    // Mark as failed with error message
    await webhookRef.set({
      status: 'failed',
      error: e.message || String(e),
    }, { merge: true });

    // Mark intent as failed if we resolved the orderId before the error
    if (orderId) {
      await admin.firestore().doc(`payments-intents/${orderId}`).set({
        status: 'failed',
        error: e.message || String(e),
        metadata: {
          completed: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
        },
      }, { merge: true });
    }
  }
};

/**
 * Process a payment event (subscription or one-time)
 * 1. Staleness check
 * 2. Read user doc (for transition detection)
 * 3. Transform raw resource → unified object
 * 4. Build order object
 * 5. Detect and dispatch transition handlers (non-blocking)
 * 6. Track analytics (non-blocking)
 * 7. Write to Firestore (user doc for subscriptions + payments-orders)
 */
async function processPaymentEvent({ category, library, resource, resourceType, uid, processor, eventType, eventId, resourceId, orderId, now, nowUNIX, webhookReceivedUNIX, assistant, raw }) {
  const Manager = assistant.Manager;
  const admin = Manager.libraries.admin;
  const isSubscription = category === 'subscription';

  // Staleness check: skip if a newer webhook already wrote to this order
  if (orderId) {
    const existingDoc = await admin.firestore().doc(`payments-orders/${orderId}`).get();
    if (existingDoc.exists) {
      const existingUpdatedUNIX = existingDoc.data()?.metadata?.updated?.timestampUNIX || 0;
      if (webhookReceivedUNIX < existingUpdatedUNIX) {
        assistant.log(`Stale webhook ${eventId}: received=${webhookReceivedUNIX}, existing updated=${existingUpdatedUNIX}, skipping`);
        return null;
      }
    }
  }

  // Read current user doc (needed for transition detection + handler context)
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const before = isSubscription ? (userData.subscription || null) : null;

  assistant.log(`User doc for ${uid}: exists=${userDoc.exists}, email=${userData?.auth?.email || 'null'}, name=${userData?.personal?.name?.first || 'null'}, subscription=${userData?.subscription?.product?.id || 'null'}`);

  // Auto-fill user name from payment processor if not already set
  if (!userData?.personal?.name?.first) {
    const customerName = extractCustomerName(resource, resourceType);
    if (customerName?.first) {
      await admin.firestore().doc(`users/${uid}`).set({
        personal: { name: customerName },
      }, { merge: true });
      assistant.log(`Auto-filled user name from ${resourceType}: ${customerName.first} ${customerName.last || ''}`);
    }
  }

  // Transform raw resource → unified object
  const transformOptions = { config: Manager.config, eventName: eventType, eventId: eventId };
  const unified = isSubscription
    ? library.toUnifiedSubscription(resource, transformOptions)
    : library.toUnifiedOneTime(resource, transformOptions);

  // Override: immediately suspend on payment denial
  // Processors keep the sub active while retrying, but we revoke access right away.
  // If the retry succeeds (e.g. PAYMENT.SALE.COMPLETED), it will restore active status.
  // PayPal: PAYMENT.SALE.DENIED, Stripe: invoice.payment_failed, Chargebee: payment_failed
  const PAYMENT_DENIED_EVENTS = ['PAYMENT.SALE.DENIED', 'invoice.payment_failed', 'payment_failed'];
  if (isSubscription && PAYMENT_DENIED_EVENTS.includes(eventType) && unified.status === 'active') {
    assistant.log(`Overriding status to suspended: ${eventType} received but provider still says active`);
    unified.status = 'suspended';
  }

  assistant.log(`Unified ${category}: product=${unified.product.id}, status=${unified.status}`, unified);

  // Read checkout context from payments-intents (attribution, discount, supplemental)
  let intentData = {};
  if (orderId) {
    const intentDoc = await admin.firestore().doc(`payments-intents/${orderId}`).get();
    intentData = intentDoc.exists ? intentDoc.data() : {};
  }

  // Build the order object (single source of truth for handlers + Firestore)
  const order = {
    id: orderId,
    type: category,
    owner: uid,
    productId: unified.product.id,
    processor: processor,
    resourceId: resourceId,
    unified: unified,
    attribution: intentData.attribution || {},
    discount: intentData.discount || null,
    supplemental: intentData.supplemental || {},
    metadata: {
      created: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
      updated: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
      updatedBy: {
        event: {
          name: eventType,
          id: eventId,
        },
      },
    },
  };

  // Detect and dispatch transition (non-blocking)
  const shouldRunHandlers = !assistant.isTesting() || process.env.TEST_EXTENDED_MODE;
  const transitionName = transitions.detectTransition(category, before, unified, eventType);

  if (transitionName) {
    assistant.log(`Transition detected: ${category}/${transitionName} (before.status=${before?.status || 'null'}, after.status=${unified.status})`);

    if (shouldRunHandlers) {
      // Extract unified refund details from the processor library (keeps handlers processor-agnostic)
      const refundDetails = (transitionName === 'payment-refunded' && library.getRefundDetails)
        ? library.getRefundDetails(raw)
        : null;

      transitions.dispatch(transitionName, category, {
        before, after: unified, order, uid, userDoc: userData, assistant, refundDetails,
      });
    } else {
      assistant.log(`Transition handler skipped (testing mode): ${category}/${transitionName}`);
    }
  }

  // Track payment analytics (non-blocking)
  // Fires independently of transitions — renewals have no transition but still need tracking
  if (shouldRunHandlers) {
    trackPayment({ category, transitionName, eventType, unified, order, uid, processor, assistant });
  }

  // Write unified subscription to user doc (subscriptions only)
  if (isSubscription) {
    await admin.firestore().doc(`users/${uid}`).set({ subscription: unified }, { merge: true });
    assistant.log(`Updated users/${uid}.subscription: status=${unified.status}, product=${unified.product.id}`);

    // Sync marketing contact with updated subscription data (non-blocking)
    if (shouldRunHandlers) {
      const email = Manager.Email(assistant);
      const updatedUserDoc = { ...userData, subscription: unified };
      email.sync(updatedUserDoc)
        .then((r) => assistant.log('Marketing sync after payment:', r))
        .catch((e) => assistant.error('Marketing sync after payment failed:', e));
    }
  }

  // Write to payments-orders/{orderId}
  if (orderId) {
    const orderRef = admin.firestore().doc(`payments-orders/${orderId}`);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      // Initialize requests on first creation only (avoid overwriting cancel/refund data set by endpoints)
      order.requests = {
        cancellation: null,
        refund: null,
      };
    } else {
      // Preserve original created timestamp on subsequent webhook events
      order.metadata.created = orderSnap.data().metadata?.created || order.metadata.created;
    }

    await orderRef.set(order, { merge: true });
    assistant.log(`Updated payments-orders/${orderId}: type=${category}, uid=${uid}, eventType=${eventType}`);
  }

  // Update payments-intents/{orderId} status to match webhook outcome
  if (orderId) {
    await admin.firestore().doc(`payments-intents/${orderId}`).set({
      status: 'completed',
      metadata: {
        completed: {
          timestamp: now,
          timestampUNIX: nowUNIX,
        },
      },
    }, { merge: true });
    assistant.log(`Updated payments-intents/${orderId}: status=completed`);
  }

  // Mark abandoned cart as completed (non-blocking, fire-and-forget)
  const { COLLECTION } = require('../../../libraries/abandoned-cart-config.js');
  admin.firestore().doc(`${COLLECTION}/${uid}`).set({
    status: 'completed',
    metadata: {
      updated: {
        timestamp: now,
        timestampUNIX: nowUNIX,
      },
    },
  }, { merge: true })
    .then(() => assistant.log(`Updated ${COLLECTION}/${uid}: status=completed`))
    .catch((e) => {
      // Ignore not-found — cart may not exist for this user
      if (e.code !== 5) {
        assistant.error(`Failed to update ${COLLECTION}/${uid}: ${e.message}`);
      }
    });

  return transitionName;
}

/**
 * Extract customer name from a raw payment processor resource
 *
 * @param {object} resource - Raw processor resource (Stripe subscription, session, invoice)
 * @param {string} resourceType - 'subscription' | 'session' | 'invoice'
 * @returns {{ first: string, last: string }|null}
 */
function extractCustomerName(resource, resourceType) {
  let fullName = null;

  // Checkout sessions have customer_details.name
  if (resourceType === 'session') {
    fullName = resource.customer_details?.name;
  }

  // Invoices have customer_name
  if (resourceType === 'invoice') {
    fullName = resource.customer_name;
  }

  // PayPal orders have payer.name
  if (resourceType === 'order') {
    const givenName = resource.payer?.name?.given_name;
    const surname = resource.payer?.name?.surname;

    if (givenName) {
      const { capitalize } = require('../../../libraries/infer-contact.js');
      return {
        first: capitalize(givenName) || null,
        last: capitalize(surname) || null,
      };
    }
  }

  // Chargebee subscriptions carry shipping_address / billing_address with first_name + last_name
  if (resourceType === 'subscription') {
    const addr = resource.shipping_address || resource.billing_address;
    if (addr?.first_name) {
      const { capitalize } = require('../../../libraries/infer-contact.js');
      return {
        first: capitalize(addr.first_name) || null,
        last: capitalize(addr.last_name) || null,
      };
    }
  }

  if (!fullName) {
    return null;
  }

  const { capitalize } = require('../../../libraries/infer-contact.js');
  const parts = fullName.trim().split(/\s+/);
  return {
    first: capitalize(parts[0]) || null,
    last: capitalize(parts.slice(1).join(' ')) || null,
  };
}
