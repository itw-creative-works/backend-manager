const path = require('path');
const powertools = require('node-powertools');

/**
 * Firestore trigger: payments-disputes/{alertId} onWrite
 *
 * Processes pending dispute alerts:
 * 1. Loads the processor module for the alert's payment processor
 * 2. Searches for the matching charge via processor.searchAndMatch()
 * 3. Issues refund + cancels subscription via processor.processDispute()
 * 4. Sends email alert to brand contact
 * 5. Updates dispute document with results
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

    // Load the processor module
    let processorModule;
    try {
      processorModule = require(path.resolve(__dirname, `processors/${processor}.js`));
    } catch (e) {
      throw new Error(`Unsupported dispute processor: ${processor}`);
    }

    // Search for the matching charge
    const match = await processorModule.searchAndMatch(alert, assistant);

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
    const result = await processorModule.processDispute(match, alert, assistant);

    // Update dispute document with results
    await disputeRef.set({
      status: 'resolved',
      match: {
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
    template: 'core/card',
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
