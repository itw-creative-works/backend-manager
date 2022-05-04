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
    self.Api.resolveUser({adminRequired: false})
    .then(async (user) => {
      const result = {
        plan: {
          id: _.get(user, 'plan.id', 'unknown'),
          payment: {
            active: _.get(user, 'plan.payment.active', false),
          },
        }
      }
      return resolve({data: result});
    })
    .catch(e => {
      return reject(e);
    })
  });
};


module.exports = Module;
