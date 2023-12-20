const uuid4 = require('uuid').v4;
const UIDGenerator = require('uid-generator');
const _ = require('lodash')
const powertools = require('node-powertools')
const uidgen = new UIDGenerator(256);

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    Api.resolveUser({adminRequired: true})
    .then(async (user) => {
      const keys = powertools.arrayify(_.get(payload.data.payload, 'keys') || ['clientId', 'privateKey']);
      const newKeys = {};

      keys
      .forEach(key => {
        if (key.match(/client/ig)) {
          newKeys.clientId = uuid4();
        } else if (key.match(/private/ig)) {
          newKeys.privateKey = uidgen.generateSync();
        }
      });

      self.libraries.admin.firestore().doc(`users/${user.auth.uid}`)
      .set({
        api: newKeys,
        metadata: Manager.Metadata().set({tag: 'user:regenerate-api-keys'}),
      }, {merge: true})
      .then(r => {
        return resolve({data: newKeys});
      })
      .catch(e => {
        return reject(assistant.errorify(`Failed to generate keys: ${e}`, {code: 500, sentry: true, send: false, log: false}).error)
      })

    })
    .catch(e => {
      return reject(e);
    })
  });

};


module.exports = Module;
