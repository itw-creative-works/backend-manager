/**
 * POST /handler/post - Create post handler (with invoice and notification)
 * Admin-only endpoint that creates invoices and sends notifications for guest posts
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const fetch = Manager.require('wonderful-fetch');

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  const response = {
    invoice: {
      success: false,
      data: {},
    },
    notification: {
      success: false,
      data: {},
    }
  };

  const postSlug = `/blog/${settings.url}`;
  const invoiceNote = `GP to ${Manager.config.brand.name} \nSlug: ${postSlug} \n\n${settings.invoiceNote || ''}`;

  // Create and send invoice if email and price are provided
  if (settings.invoiceEmail && settings.invoicePrice) {
    // Create invoice
    const createdInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
      method: 'POST',
      response: 'json',
      body: {
        backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        method: 'post',
        service: 'paypal',
        command: 'v2/invoicing/invoices',
        body: {
          detail: {
            currency_code: 'USD',
            note: invoiceNote,
            memo: invoiceNote,
          },
          primary_recipients: [
            {
              billing_info: {
                email_address: settings.invoiceEmail,
              },
            }
          ],
          items: [
            {
              name: 'GP',
              description: `Slug: ${postSlug}`,
              quantity: '1',
              unit_amount: {
                currency_code: 'USD',
                value: `${settings.invoicePrice}`
              },
              unit_of_measure: 'QUANTITY',
            },
          ],
        }
      },
    }).catch(e => e);

    if (createdInvoice instanceof Error) {
      return assistant.respond(createdInvoice.message, { code: 500 });
    }

    // Send invoice
    const createdInvoiceId = (createdInvoice?.href ?? '').split('/').pop();
    const sentInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
      method: 'POST',
      response: 'json',
      body: {
        backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        service: 'paypal',
        command: `v2/invoicing/invoices/${createdInvoiceId}/send`,
        method: 'post',
        body: {}
      },
    }).catch(e => e);

    if (sentInvoice instanceof Error) {
      return assistant.respond(sentInvoice.message, { code: 500 });
    }

    response.invoice = {
      success: true,
      data: sentInvoice,
    };
  }

  // Send notification (unless explicitly disabled)
  if (settings.sendNotification !== false) {
    // Use NEW API format
    await fetch(`${Manager.project.apiUrl}/backend-manager/admin/notification`, {
      method: 'POST',
      response: 'json',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_MANAGER_KEY}`,
      },
      body: {
        notification: {
          title: settings.title,
          body: `"${settings.title}" was just published on our blog. It's a great read and we think you'll enjoy the content!`,
          click_action: `${Manager.config.brand.url}/blog`,
          icon: Manager.config.brand.images.brandmark,
        }
      },
    }).catch(e => {
      assistant.error('Failed to send notification:', e);
    });

    response.notification = {
      success: true,
      data: {},
    };
  }

  // Track analytics
  assistant.analytics.event('handler/post', { action: 'create' });

  return assistant.respond(response);
};
