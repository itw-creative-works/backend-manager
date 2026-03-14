const moment = require('moment');
const powertools = require('node-powertools');

/**
 * Firestore trigger: payments-disputes/{alertId} onWrite
 *
 * Processes pending dispute alerts:
 * 1. Searches Stripe invoices by date range + amount
 * 2. Matches card last4 digits
 * 3. Issues full refund on matched invoice
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

    assistant.log(`Processing dispute ${alertId}: processor=${processor}, amount=${alert.amount}, card=****${alert.card.last4}, date=${alert.transactionDate}`);

    // Only Stripe is supported for now
    if (processor !== 'stripe') {
      throw new Error(`Unsupported processor: ${processor}. Only 'stripe' is currently supported.`);
    }

    // Search for the matching invoice and process
    const match = await searchAndMatch({ alert, assistant });

    // Build timestamps
    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    if (!match) {
      // No matching invoice found
      await disputeRef.set({
        status: 'no-match',
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

      assistant.log(`Dispute ${alertId}: no matching invoice found`);

      // Still send email to alert brand about unmatched dispute
      if (!assistant.isTesting() || process.env.TEST_EXTENDED_MODE) {
        sendDisputeEmail({ alert, match: null, alertId, assistant });
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
        invoiceId: match.invoiceId,
        subscriptionId: match.subscriptionId || null,
        customerId: match.customerId,
        uid: match.uid || null,
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
 * Search Stripe invoices by date range + amount and match card last4
 *
 * @param {object} options
 * @param {object} options.alert - Normalized alert data
 * @param {object} options.assistant - Assistant instance
 * @returns {object|null} Match details or null
 */
async function searchAndMatch({ alert, assistant }) {
  const StripeLib = require('../../../libraries/payment/processors/stripe.js');
  const stripe = StripeLib.init();

  const amountCents = Math.round(alert.amount * 100);
  const alertDate = moment(alert.transactionDate);

  if (!alertDate.isValid()) {
    throw new Error(`Invalid transactionDate: ${alert.transactionDate}`);
  }

  const start = alertDate.clone().subtract(2, 'days').unix();
  const end = alertDate.clone().add(2, 'days').unix();

  assistant.log(`Searching Stripe invoices: amount=${amountCents} cents, range=${moment.unix(start).format('YYYY-MM-DD')} to ${moment.unix(end).format('YYYY-MM-DD')}`);

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
    const customerId = invoice.customer;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        uid = customer.metadata?.uid || null;
      } catch (e) {
        assistant.error(`Failed to retrieve customer ${customerId}: ${e.message}`);
      }
    }

    return {
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription || null,
      customerId: customerId,
      uid: uid,
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

      assistant.log(`Refund success: refundId=${refund.id}, amount=${amountCents}, invoice=${match.invoiceId}`);
    } catch (e) {
      result.refundStatus = 'failed';
      result.errors.push(`Refund failed: ${e.message}`);
      assistant.error(`Refund failed for invoice ${match.invoiceId}: ${e.message}`);
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
  const subject = `Dispute alert: ${matched} [${alertId}]`;

  const disputeDetails = {
    id: alertId,
    card: `****${alert.card.last4} (${alert.card.brand || 'unknown'})`,
    amount: `$${alert.amount}`,
    date: alert.transactionDate,
    processor: alert.processor,
  };

  const matchDetails = match
    ? {
        invoiceId: match.invoiceId,
        subscriptionId: match.subscriptionId || 'N/A',
        uid: match.uid || 'unknown',
        refund: result?.refundStatus || 'N/A',
        cancel: result?.cancelStatus || 'N/A',
      }
    : null;

  const messageLines = [
    `A dispute alert has been received and ${match ? 'automatically processed' : 'could not be matched to an invoice'}.`,
    '',
    '<strong>Dispute Details:</strong>',
    `<pre><code>${JSON.stringify(disputeDetails, null, 2)}</code></pre>`,
  ];

  if (matchDetails) {
    messageLines.push(
      '',
      '<strong>Match & Actions:</strong>',
      `<pre><code>${JSON.stringify(matchDetails, null, 2)}</code></pre>`,
    );
  }

  if (result?.errors?.length) {
    messageLines.push(
      '',
      '<strong>Errors:</strong>',
      `<pre><code>${JSON.stringify(result.errors, null, 2)}</code></pre>`,
    );
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
        preview: `Dispute alert: ${matched} — $${alert.amount} on ****${alert.card.last4}`,
      },
      body: {
        title: subject,
        message: messageLines.join('<br>'),
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
