const _ = require('lodash')
const powertools = require('node-powertools')

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const oldDate = powertools.timestamp(new Date(0), {output: 'string'})
    const oldDateUNIX = powertools.timestamp(oldDate, {output: 'unix'});

    self.Api.resolveUser({adminRequired: false})
    .then(async (user) => {
      const result = {
        plan: {
          id: _.get(user, 'plan.id', 'unknown'),
          expires: {
            timestamp: _.get(user, 'plan.expires.timestamp', oldDate),
            timestampUNIX: _.get(user, 'plan.expires.timestampUNIX', oldDateUNIX),
          },
          trial: {
            activated: _.get(user, 'plan.trial.activated', false),
            date: {
              timestamp: _.get(user, 'plan.trial.date.timestamp', oldDate),
              timestampUNIX: _.get(user, 'plan.trial.date.timestampUNIX', oldDateUNIX),
            }
          },
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
