const fetch = require('node-fetch');
const _ = require('lodash')

function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Api = s;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.Manager.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    const createdInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authenticationToken: Manager.config.backend_manager.key,
        method: 'post',
        service: 'paypal',
        command: 'v2/invoicing/invoices',
        body: {
          detail: {
            currency_code: 'USD',
            note: `Post to ${Manager.config.brand.name}`,
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
              name: `Guest post`,
              description: `blog/${payload.data.payload.url}`,
              quantity: '1',
              unit_amount: {
                currency_code: 'USD',
                value: `${payload.data.payload.invoicePrice}`
              },
              // discount: {
              //   percent: '5'
              // },
              unit_of_measure: 'QUANTITY'
            },
          ],
        }
      }),
    })
    .then(function (res) {
      return res.text()
        .then(function (data) {
          if (res.ok) {
            return JSON.parse(data)
          } else {
            throw new Error(data || res.statusText || 'Unknown error.')
          }
        })
    })
    .catch(function (e) {
      return e;
    });

    if (createdInvoice instanceof Error) {
      return reject(assistant.errorManager(createdInvoice, {code: 400, sentry: false, send: false, log: false}).error)
    }

    const createdInvoiceId = _.get(createdInvoice, 'href', '').split('/').pop();
    const sentInvoice = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authenticationToken: Manager.config.backend_manager.key,
        service: 'paypal',
        command: `v2/invoicing/invoices/${createdInvoiceId}/send`,
        method: 'post',
        body: {
        }
      }),
    })
    .then(function (res) {
      return res.text()
        .then(function (data) {
          if (res.ok) {
            return resolve({data: JSON.parse(data)})
          } else {
            throw new Error(data || res.statusText || 'Unknown error.')
          }
        })
    })
    .catch(function (e) {
      return reject(assistant.errorManager(e, {code: 500, sentry: false, send: false, log: false}).error)
    });

  });

};


module.exports = Module;
