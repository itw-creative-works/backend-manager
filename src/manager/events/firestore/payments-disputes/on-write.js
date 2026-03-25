const moment = require('moment');
const powertools = require('node-powertools');

/**
 * Firestore trigger: payments-disputes/{alertId} onWrite
 *
 * Processes pending dispute alerts:
 * 1. Tries direct match via charge ID or payment intent (from Chargeblast alert.updated)
 * 2. Falls back to searching Stripe invoices by date range + amount + card last4
 * 3. Issues full refund on matched charge
 * 4. Cancels subscription immediately (Stripe fires webhook → existing pipeline handles user doc)
 * 5. Sends email alert to brand contact
 * 6. Updates dispute document with results
 */
module.exports = async ({ assistant, change, context }) => {
  const Manager = assistant.Manager;
  const admin = Manager.libraries.admin;

  const dataAfter = change.after.data();

  // Short-circuit: deleted doc or non-pending status
  if (!dataAfter || dataAfter.status !== 'pending') {
    return;
  }

  const alertId = context.params.alertId;
  const disputeRef = admin.firestore().doc(`payments-disputes/${alertId}`);

  // Set status to processing
  await disputeRef.set({ status: 'processing' }, { merge: true });

  try {
    const alert = dataAfter.alert;
    const processor = alert.processor || 'stripe';

    assistant.log(`Processing dispute ${alertId}: processor=${processor}, amount=${alert.amount}, card=****${alert.card.last4}, date=${alert.transactionDate}, chargeId=${alert.chargeId || 'none'}, paymentIntentId=${alert.paymentIntentId || 'none'}`);

    // Only Stripe is supported for now
    if (processor !== 'stripe') {
      throw new Error(`Unsupported processor: ${processor}. Only 'stripe' is currently supported.`);
    }

    // Search for the matching charge
    const match = await searchAndMatch({ alert, assistant });

    // Build timestamps
    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    if (!match) {
      // No matching charge found
      await disputeRef.set({
        status: 'no-match',
        match: null,
        actions: {
          refund: 'skipped',
          cancel: 'skipped',
          email: 'pending',
        },
        metadata: {
          completed: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
        },
      }, { merge: true });

      assistant.log(`Dispute ${alertId}: no matching charge found`);

      // Still send email to alert brand about unmatched dispute
      if (!assistant.isTesting() || process.env.TEST_EXTENDED_MODE) {
        sendDisputeEmail({ alert, match: null, result: null, alertId, assistant });
        await disputeRef.set({ actions: { email: 'success' } }, { merge: true });
      } else {
        assistant.log(`Dispute ${alertId}: skipping email (testing mode)`);
        await disputeRef.set({ actions: { email: 'skipped-testing' } }, { merge: true });
      }

      return;
    }

    // Process refund and cancel
    const result = await processDispute({ match, alert, assistant });

    // Update dispute document with results
    await disputeRef.set({
      status: 'resolved',
      match: {
        method: match.method,
        invoiceId: match.invoiceId || null,
        subscriptionId: match.subscriptionId || null,
        customerId: match.customerId,
        uid: match.uid || null,
        email: match.email || null,
        chargeId: match.chargeId,
        refundId: result.refundId || null,
        amountRefunded: result.amountRefunded || null,
        currency: result.currency || null,
      },
      actions: {
        refund: result.refundStatus,
        cancel: result.cancelStatus,
        email: 'pending',
      },
      errors: result.errors,
      metadata: {
        completed: {
          timestamp: now,
          timestampUNIX: nowUNIX,
        },
      },
    }, { merge: true });

    // Send email alert (fire-and-forget)
    if (!assistant.isTesting() || process.env.TEST_EXTENDED_MODE) {
      sendDisputeEmail({ alert, match, result, alertId, assistant });
      await disputeRef.set({ actions: { email: 'success' } }, { merge: true });
    } else {
      assistant.log(`Dispute ${alertId}: skipping email (testing mode)`);
      await disputeRef.set({ actions: { email: 'skipped-testing' } }, { merge: true });
    }

    assistant.log(`Dispute ${alertId} resolved: refund=${result.refundStatus}, cancel=${result.cancelStatus}`);
  } catch (e) {
    assistant.error(`Dispute ${alertId} failed: ${e.message}`, e);

    await disputeRef.set({
      status: 'failed',
      error: e.message || String(e),
    }, { merge: true });
  }
};

/**
 * Try to match the dispute alert to a Stripe charge.
 *
 * Strategy (in order):
 * 1. Direct lookup via charge ID (externalOrder from Chargeblast)
 * 2. Direct lookup via payment intent ID (metadata from Chargeblast)
 * 3. Fallback: search invoices by date range + amount + card last4
 *
 * @param {object} options
 * @param {object} options.alert - Normalized alert data
 * @param {object} options.assistant - Assistant instance
 * @returns {object|null} Match details or null
 */
async function searchAndMatch({ alert, assistant }) {
  const StripeLib = require('../../../libraries/payment/processors/stripe.js');
  const stripe = StripeLib.init();

  // Strategy 1: Direct charge lookup
  if (alert.chargeId && alert.chargeId.startsWith('ch_')) {
    assistant.log(`Trying direct charge lookup: ${alert.chargeId}`);

    try {
      const charge = await stripe.charges.retrieve(alert.chargeId, {
        expand: ['invoice', 'customer'],
      });

      const match = await resolveMatchFromCharge({ charge, stripe, assistant, method: 'charge-id' });

      if (match) {
        return match;
      }
    } catch (e) {
      assistant.log(`Direct charge lookup failed for ${alert.chargeId}: ${e.message}`);
    }
  }

  // Strategy 2: Direct payment intent lookup
  if (alert.paymentIntentId && alert.paymentIntentId.startsWith('pi_')) {
    assistant.log(`Trying direct payment intent lookup: ${alert.paymentIntentId}`);

    try {
      const pi = await stripe.paymentIntents.retrieve(alert.paymentIntentId, {
        expand: ['latest_charge', 'latest_charge.invoice', 'latest_charge.customer'],
      });

      const charge = pi.latest_charge;
      if (charge) {
        const match = await resolveMatchFromCharge({ charge, stripe, assistant, method: 'payment-intent' });

        if (match) {
          return match;
        }
      }
    } catch (e) {
      assistant.log(`Direct payment intent lookup failed for ${alert.paymentIntentId}: ${e.message}`);
    }
  }

  // Strategy 3: Fallback — search invoices by date range + amount + card last4
  return searchInvoicesFallback({ alert, stripe, assistant });
}

/**
 * Build a match object from a Stripe charge
 */
async function resolveMatchFromCharge({ charge, stripe, assistant, method }) {
  if (!charge || charge.status !== 'succeeded') {
    assistant.log(`Charge ${charge?.id} status=${charge?.status}, skipping`);
    return null;
  }

  // Resolve UID from customer metadata
  let uid = null;
  let email = null;
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;

  if (charge.customer && typeof charge.customer === 'object') {
    uid = charge.customer.metadata?.uid || null;
    email = charge.customer.email || null;
  } else if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      uid = customer.metadata?.uid || null;
      email = customer.email || null;
    } catch (e) {
      assistant.error(`Failed to retrieve customer ${customerId}: ${e.message}`);
    }
  }

  // Resolve invoice/subscription
  const invoiceId = typeof charge.invoice === 'string'
    ? charge.invoice
    : charge.invoice?.id || null;
  const subscriptionId = typeof charge.invoice === 'object'
    ? charge.invoice?.subscription || null
    : null;

  assistant.log(`Matched via ${method}: charge=${charge.id}, customer=${customerId}, uid=${uid}, invoice=${invoiceId}`);

  return {
    method: method,
    invoiceId: invoiceId,
    subscriptionId: subscriptionId,
    customerId: customerId,
    uid: uid,
    email: email,
    chargeId: charge.id,
  };
}

/**
 * Fallback: search Stripe invoices by date range + amount and match card last4
 */
async function searchInvoicesFallback({ alert, stripe, assistant }) {
  const amountCents = Math.round(alert.amount * 100);
  const alertDate = moment(alert.transactionDate);

  if (!alertDate.isValid()) {
    throw new Error(`Invalid transactionDate: ${alert.transactionDate}`);
  }

  const start = alertDate.clone().subtract(2, 'days').unix();
  const end = alertDate.clone().add(2, 'days').unix();

  assistant.log(`Fallback: searching Stripe invoices: amount=${amountCents} cents, range=${moment.unix(start).format('YYYY-MM-DD')} to ${moment.unix(end).format('YYYY-MM-DD')}`);

  // Search invoices by date range and amount
  const invoices = await stripe.invoices.search({
    limit: 100,
    query: `created>${start} AND created<${end} AND total:${amountCents}`,
    expand: ['data.payment_intent.payment_method'],
  });

  if (!invoices.data.length) {
    assistant.log(`No invoices found for amount=${amountCents} in date range`);
    return null;
  }

  if (invoices.data.length >= 100) {
    assistant.log(`Warning: 100+ invoices found, results may be truncated`);
  }

  assistant.log(`Found ${invoices.data.length} invoice(s), matching card last4=${alert.card.last4}`);

  // Loop through invoices and match card last4
  for (const invoice of invoices.data) {
    const invoiceLast4 = invoice?.payment_intent?.payment_method?.card?.last4;

    assistant.log(`Checking invoice ${invoice.id}: card last4=${invoiceLast4 || 'unknown'}`);

    if (!invoiceLast4 || invoiceLast4 !== alert.card.last4) {
      continue;
    }

    assistant.log(`Matched invoice ${invoice.id}: card last4=${invoiceLast4}`);

    // Resolve UID from customer metadata
    let uid = null;
    let email = null;
    const customerId = invoice.customer;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        uid = customer.metadata?.uid || null;
        email = customer.email || null;
      } catch (e) {
        assistant.error(`Failed to retrieve customer ${customerId}: ${e.message}`);
      }
    }

    return {
      method: 'invoice-search',
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription || null,
      customerId: customerId,
      uid: uid,
      email: email,
      chargeId: invoice.charge || null,
    };
  }

  assistant.log(`No invoice matched card last4=${alert.card.last4}`);
  return null;
}

/**
 * Process refund + cancellation for a matched dispute
 *
 * @param {object} options
 * @param {object} options.match - Match details from searchAndMatch
 * @param {object} options.alert - Normalized alert data
 * @param {object} options.assistant - Assistant instance
 * @returns {object} Result with statuses
 */
async function processDispute({ match, alert, assistant }) {
  const StripeLib = require('../../../libraries/payment/processors/stripe.js');
  const stripe = StripeLib.init();

  const amountCents = Math.round(alert.amount * 100);
  const result = {
    refundId: null,
    amountRefunded: null,
    currency: null,
    refundStatus: 'skipped',
    cancelStatus: 'skipped',
    errors: [],
  };

  // Issue full refund
  if (match.chargeId) {
    try {
      const refund = await stripe.refunds.create({
        charge: match.chargeId,
        amount: amountCents,
      });

      result.refundId = refund.id;
      result.amountRefunded = amountCents;
      result.currency = refund.currency;
      result.refundStatus = 'success';

      assistant.log(`Refund success: refundId=${refund.id}, amount=${amountCents}, charge=${match.chargeId}`);
    } catch (e) {
      result.refundStatus = 'failed';
      result.errors.push(`Refund failed: ${e.message}`);
      assistant.error(`Refund failed for charge ${match.chargeId}: ${e.message}`);
    }
  }

  // Cancel subscription immediately
  // Stripe fires customer.subscription.deleted webhook → existing pipeline handles user doc update
  if (match.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(match.subscriptionId);
      result.cancelStatus = 'success';

      assistant.log(`Subscription cancelled: sub=${match.subscriptionId}`);
    } catch (e) {
      result.cancelStatus = 'failed';
      result.errors.push(`Cancel failed: ${e.message}`);
      assistant.error(`Cancel failed for sub ${match.subscriptionId}: ${e.message}`);
    }
  }

  return result;
}

/**
 * Send dispute alert email to brand contact (fire-and-forget)
 *
 * @param {object} options
 * @param {object} options.alert - Normalized alert data
 * @param {object|null} options.match - Match details (null if no match)
 * @param {object} [options.result] - Processing result (refund/cancel statuses)
 * @param {string} options.alertId - Dispute alert ID
 * @param {object} options.assistant - Assistant instance
 */
function sendDisputeEmail({ alert, match, result, alertId, assistant }) {
  const Manager = assistant.Manager;
  const email = Manager.Email(assistant);
  const brandEmail = Manager.config.brand?.contact?.email;

  if (!brandEmail) {
    assistant.error(`sendDisputeEmail(): No brand.contact.email configured, skipping`);
    return;
  }

  const matched = match ? 'Matched' : 'Unmatched';
  const subject = `Dispute Alert: ${matched} — $${alert.amount} on ****${alert.card.last4} [${alertId}]`;

  const messageLines = [];

  // Status banner
  if (match && result) {
    const hasErrors = result.errors?.length > 0;
    const banner = hasErrors ? 'Partially processed (see errors below)' : 'Automatically processed';
    messageLines.push(`<strong>${banner}</strong>`);
  } else {
    messageLines.push('<strong>Could not be matched to a charge — manual review required.</strong>');
  }

  messageLines.push('');

  // Alert details
  messageLines.push('<strong>Alert Details:</strong>');
  messageLines.push('<ul>');
  messageLines.push(`<li><strong>Alert ID:</strong> ${alertId}</li>`);
  messageLines.push(`<li><strong>Type:</strong> ${alert.alertType || 'N/A'}</li>`);
  messageLines.push(`<li><strong>Card:</strong> ****${alert.card.last4} (${alert.card.brand || 'unknown'})</li>`);
  messageLines.push(`<li><strong>Amount:</strong> $${alert.amount}</li>`);
  messageLines.push(`<li><strong>Transaction Date:</strong> ${alert.transactionDate}</li>`);
  messageLines.push(`<li><strong>Processor:</strong> ${alert.processor}</li>`);
  messageLines.push(`<li><strong>Reason:</strong> ${alert.reasonCode || 'N/A'}</li>`);
  messageLines.push(`<li><strong>Network:</strong> ${alert.subprovider || 'N/A'}</li>`);
  messageLines.push(`<li><strong>Customer Email:</strong> ${alert.customerEmail || 'N/A'}</li>`);
  messageLines.push(`<li><strong>Already Refunded:</strong> ${alert.isRefunded ? 'Yes' : 'No'}</li>`);
  messageLines.push('</ul>');

  // Match & action details
  if (match) {
    messageLines.push('<strong>Match Details:</strong>');
    messageLines.push('<ul>');
    messageLines.push(`<li><strong>Method:</strong> ${match.method}</li>`);
    messageLines.push(`<li><strong>Charge:</strong> ${match.chargeId || 'N/A'}</li>`);
    messageLines.push(`<li><strong>Invoice:</strong> ${match.invoiceId || 'N/A'}</li>`);
    messageLines.push(`<li><strong>Subscription:</strong> ${match.subscriptionId || 'N/A'}</li>`);
    messageLines.push(`<li><strong>Customer:</strong> ${match.customerId || 'N/A'}</li>`);
    messageLines.push(`<li><strong>Customer Email:</strong> ${match.email || 'N/A'}</li>`);
    messageLines.push(`<li><strong>UID:</strong> ${match.uid || 'unknown'}</li>`);
    messageLines.push('</ul>');

    if (result) {
      messageLines.push('<strong>Actions Taken:</strong>');
      messageLines.push('<ul>');
      messageLines.push(`<li><strong>Refund:</strong> ${result.refundStatus}${result.refundId ? ` (${result.refundId})` : ''}${result.amountRefunded ? ` — $${(result.amountRefunded / 100).toFixed(2)} ${result.currency || ''}` : ''}</li>`);
      messageLines.push(`<li><strong>Cancel Subscription:</strong> ${result.cancelStatus}</li>`);
      messageLines.push('</ul>');
    }
  }

  // Stripe link
  if (alert.stripeUrl) {
    messageLines.push(`<br><a href="${alert.stripeUrl}">View in Stripe Dashboard</a>`);
  }

  // Errors
  if (result?.errors?.length) {
    messageLines.push('');
    messageLines.push('<strong>Errors:</strong>');
    messageLines.push('<ul>');
    result.errors.forEach((err) => {
      messageLines.push(`<li>${err}</li>`);
    });
    messageLines.push('</ul>');
  }

  email.send({
    sender: 'internal',
    to: brandEmail,
    subject: subject,
    template: 'main/basic/card',
    categories: ['order/dispute-alert'],
    copy: true,
    data: {
      email: {
        preview: `Dispute Alert: ${matched} — $${alert.amount} on ****${alert.card.last4}`,
      },
      body: {
        title: `Dispute Alert: ${matched}`,
        message: messageLines.join('\n'),
      },
    },
  })
    .then((r) => {
      assistant.log(`sendDisputeEmail(): Success alertId=${alertId}`);
    })
    .catch((e) => {
      assistant.error(`sendDisputeEmail(): Failed alertId=${alertId}: ${e.message}`);
    });
}
