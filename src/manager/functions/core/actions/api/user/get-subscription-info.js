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

    Api.resolveUser({adminRequired: false})
    .then(async (user) => {
      const result = {
        subscription: {
          product: {
            id: user?.subscription?.product?.id || 'basic',
            name: user?.subscription?.product?.name || 'Basic',
          },
          status: user?.subscription?.status || 'active',
          expires: {
            timestamp: user?.subscription?.expires?.timestamp || oldDate,
            timestampUNIX: user?.subscription?.expires?.timestampUNIX || oldDateUNIX,
          },
          trial: {
            claimed: user?.subscription?.trial?.claimed ?? false,
            expires: {
              timestamp: user?.subscription?.trial?.expires?.timestamp || oldDate,
              timestampUNIX: user?.subscription?.trial?.expires?.timestampUNIX || oldDateUNIX,
            },
          },
          cancellation: {
            pending: user?.subscription?.cancellation?.pending ?? false,
            date: {
              timestamp: user?.subscription?.cancellation?.date?.timestamp || oldDate,
              timestampUNIX: user?.subscription?.cancellation?.date?.timestampUNIX || oldDateUNIX,
            },
          },
          payment: {
            processor: user?.subscription?.payment?.processor || null,
            frequency: user?.subscription?.payment?.frequency || null,
            startDate: {
              timestamp: user?.subscription?.payment?.startDate?.timestamp || oldDate,
              timestampUNIX: user?.subscription?.payment?.startDate?.timestampUNIX || oldDateUNIX,
            },
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
