function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Set defaults
    payload.data.payload.path = `${payload.data.payload.path || ''}`;
    payload.data.payload.document = payload.data.payload.document || {};
    payload.data.payload.options = payload.data.payload.options || {};
    payload.data.payload.options.merge = typeof payload.data.payload.options.merge === 'undefined' ? true : payload.data.payload.options.merge;
    payload.data.payload.options.metadataTag = typeof payload.data.payload.options.metadataTag === 'undefined' ? 'admin:firestore-write' : payload.data.payload.options.metadataTag;

    // Perform checks
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    } else if (!payload.data.payload.path) {
      return reject(assistant.errorify(`Path parameter required.`, {code: 400}));
    }

    // Fix path
    if (payload.data.payload.path.match(/\{pushId\}/)) {
      payload.data.payload.path = payload.data.payload.path.replace(/\{pushId\}/ig, require('pushid')());
    } else if (payload.data.payload.path.match(/\{nanoId\}/)) {
      payload.data.payload.path = payload.data.payload.path.replace(/\{nanoId\}/ig, Manager.Utilities().randomId());
    }

    // Set metadata
    payload.data.payload.document.metadata = Manager.Metadata().set({tag: payload.data.payload.options.metadataTag})

    // Delete metadataTag
    delete payload.data.payload.options.metadataTag;

    // Log
    assistant.log(`main(): Writing`,
      payload.data.payload.path,
      payload.data.payload.document,
      payload.data.payload.options
    );

    // Write to Firestore
    await self.libraries.admin.firestore().doc(payload.data.payload.path)
    .set(payload.data.payload.document, payload.data.payload.options)
    .then(r => {
      return resolve({data: {path: payload.data.payload.path}});
    })
    .catch(e => {
      return reject(assistant.errorify(e, {code: 500}));
    })
  });

};


module.exports = Module;
