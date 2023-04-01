const moment = require('moment');
const uuidv4 = require('uuid').v4;

function Metadata(Manager, document) {
  const self = this;

  self.Manager = Manager;

  self.document = document || {};

  return self;
}

Metadata.prototype.set = function (metadata) {
  const self = this;

  const now = moment();

  self.document = self.document || {};
  self.document.metadata = self.document.metadata || {};

  self.document.metadata.updated = self.document.metadata.updated || {};
  self.document.metadata.updated.timestamp = now.toISOString();
  self.document.metadata.updated.timestampUNIX = now.unix();
  self.document.metadata.tag = metadata.tag || uuidv4();

  self.Manager.assistant.log(`Metadata: #${self.document.metadata.tag}`);

  return self.document.metadata;
};

module.exports = Metadata;
