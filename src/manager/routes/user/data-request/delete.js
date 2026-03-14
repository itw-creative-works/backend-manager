/**
 * DELETE /user/data-request - Cancel a pending data request
 * Deletes the most recent pending data request for the authenticated user.
 */
module.exports = async ({ assistant, user, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  const uid = user.auth.uid;

  // Get the most recent request
  const mostRecentSnapshot = await admin.firestore()
    .collection('data-requests')
    .where('owner', '==', uid)
    .orderBy('metadata.created.timestampUNIX', 'desc')
    .limit(1)
    .get();

  if (mostRecentSnapshot.empty || mostRecentSnapshot.docs[0].data().status !== 'pending') {
    return assistant.respond('No pending data request found.', { code: 404 });
  }

  const requestDoc = mostRecentSnapshot.docs[0];
  const request = requestDoc.data();

  // Delete the request document
  await admin.firestore().doc(`data-requests/${requestDoc.id}`).delete();

  assistant.log(`Data request cancelled: ${requestDoc.id} for user ${uid}`);

  // Send cancellation email (fire-and-forget)
  sendCancellationEmail(assistant, user, requestDoc.id);

  return assistant.respond({
    message: 'Your data request has been cancelled.',
    request: { id: requestDoc.id, ...request },
  });
};

/**
 * Send data request cancellation email (fire-and-forget)
 */
function sendCancellationEmail(assistant, user, requestId) {
  const Manager = assistant.Manager;
  const mailer = Manager.Email(assistant);
  const uid = user.auth.uid;

  mailer.send({
    to: user,
    sender: 'account',
    categories: ['account/data-request-cancelled'],
    subject: `Your data request has been cancelled #${requestId}`,
    template: 'default',
    copy: true,
    data: {
      email: {
        preview: `Your data export request #${requestId} has been cancelled.`,
      },
      body: {
        title: 'Data Request Cancelled',
        message: `Your data export request has been cancelled as requested.

- **Request reference:** #${requestId}
- **Account UID:** ${uid}

You may submit a new data request at any time from your account page.

If you did not cancel this request, please contact us immediately by replying to this email.`,
      },
    },
  })
    .then((result) => {
      assistant.log(`sendCancellationEmail(): Success, status=${result.status}`);
    })
    .catch((e) => {
      assistant.error(`sendCancellationEmail(): Failed: ${e.message}`);
    });
}
