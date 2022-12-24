const fetch = require('wonderful-fetch');
const _ = require('lodash')

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    payload.response.data = {
      invoice: {
        success: false,
        data: {},
      },
      notification: {
        success: false,
        data: {},
      }
    }

    const postSlug = `/blog/${payload.data.payload.url}`;
    const postUrl = `${Manager.config.brand.url}${postSlug}`;

    if (payload.data.payload.invoiceEmail && payload.data.payload.invoicePrice) {
      // Create invoice
      const createdInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
        method: 'POST',
        response: 'json',
        body: {
          authenticationToken: Manager.config.backend_manager.key,
          method: 'post',
          service: 'paypal',
          command: 'v2/invoicing/invoices',
          body: {
            detail: {
              currency_code: 'USD',
              // note: `Post to ${Manager.config.brand.name} \n ${payload.data.payload.invoiceNote || ''}`,
              note: `GP to ${Manager.config.brand.name} \n\n ${payload.data.payload.invoiceNote || ''}`,
              memo: `GP to ${Manager.config.brand.name} \n\n Slug: ${postSlug}`,
            },
            primary_recipients: [
              {
                billing_info: {
                  email_address: payload.data.payload.invoiceEmail,
                },
              }
            ],
            items: [
              {
                // name: `Guest Post`,
                name: `GP`,
                // description: `Post URL: ${postUrl}`,
                description: `Slug: ${postSlug}`,
                quantity: '1',
                unit_amount: {
                  currency_code: 'USD',
                  value: `${payload.data.payload.invoicePrice}`
                },
                // discount: {
                //   percent: '5'
                // },
                unit_of_measure: 'QUANTITY',
              },
            ],
          }
        },
      })
      .then(response => response)
      .catch(e => e);

      if (createdInvoice instanceof Error) {
        return reject(assistant.errorManager(createdInvoice, {code: 400, sentry: false, send: false, log: false}).error)
      }

      // Send invoice
      const createdInvoiceId = _.get(createdInvoice, 'href', '').split('/').pop();
      const sentInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
        method: 'POST',
        response: 'json',
        body: {
          authenticationToken: Manager.config.backend_manager.key,
          service: 'paypal',
          command: `v2/invoicing/invoices/${createdInvoiceId}/send`,
          method: 'post',
          body: {
          }
        },
      })
      .then(response => response)
      .catch(e => e);

      if (sentInvoice instanceof Error) {
        return reject(assistant.errorManager(sentInvoice, {code: 500, sentry: false, send: false, log: false}).error)
      }

      payload.response.data.invoice = {
        success: true,
        data: sentInvoice,
      }

    }

    // Send notification
    if (payload.data.payload.sendNotification !== false) {
      const sentNotification = fetch(`https://us-central1-${Manager.project.projectId}.cloudfunctions.net/bm_api`, {
        method: 'POST',
        response: 'json',
        body: {
          authenticationToken: Manager.config.backend_manager.key,
          command: `admin:send-notification`,
          payload: {
            title: payload.data.payload.title,
            body: `"${payload.data.payload.title}" was just published on our blog. It's a great read and we think you'll enjoy the content!`,
            // click_action: `${Manager.config.brand.url}/${postUrl}`,
            click_action: `${Manager.config.brand.url}/blog`,
            icon: Manager.config.brand.brandmark,
          }
        },
      })
      .then(response => response)
      .catch(e => e);
    }

    return resolve({data: payload.response.data})


  });

};


module.exports = Module;
