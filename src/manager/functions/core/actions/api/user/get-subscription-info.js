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
        plan: {
          id: user?.plan?.id || 'unknown',
          expires: {
            timestamp: user?.plan?.expires?.timestamp || oldDate,
            timestampUNIX: user?.plan?.expires?.timestampUNIX || oldDateUNIX,
          },
          trial: {
            activated: user?.plan?.trial?.activated ?? false,
            date: {
              timestamp: user?.plan?.trial?.date?.timestamp || oldDate,
              timestampUNIX: user?.plan?.trial?.date?.timestampUNIX || oldDateUNIX,
            }
          },
          payment: {
            active: user?.plan?.payment?.active ?? false,
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
