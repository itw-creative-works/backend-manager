/**
 * Unified email library — transactional + marketing
 *
 * Usage:
 *   const email = Manager.Email(assistant);
 *
 *   // Transactional (default)
 *   await email.send({ to, subject, template, ... });
 *   await email.build({ ... });
 *
 *   // Marketing campaign
 *   await email.send({ type: 'marketing', name, subject, segments, ... });
 *
 *   // Add a new contact (newsletter subscribe)
 *   await email.add({ email, firstName, lastName, source });
 *
 *   // Sync full user data to SendGrid/Beehiiv (all custom fields)
 *   await email.sync(userDoc);
 *
 *   // Remove contact from all providers
 *   await email.remove('user@example.com');
 *
 *   // Campaign management
 *   await email.cancelCampaign(id);
 *   await email.getCampaign(id);
 *   await email.listCampaigns({ status: 'scheduled' });
 */
const Transactional = require('./transactional/index.js');
const Marketing = require('./marketing/index.js');

function Email(assistant) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant.Manager;

  // Compose internal modules
  self._transactional = new Transactional(assistant);
  self._marketing = new Marketing(assistant);

  return self;
}

/**
 * Send an email.
 *
 * @param {object} settings
 * @param {string} [settings.type] - 'transactional' (default) or 'marketing'
 *
 * Transactional settings: { to, subject, template, sender, sendAt, data, ... }
 * Marketing settings: { name, subject, template, sender, segments, lists, sendAt, ... }
 *
 * @returns {object} Result from the appropriate sender
 */
Email.prototype.send = function (settings) {
  const self = this;
  const type = settings.type || 'transactional';

  if (type === 'marketing') {
    return self._marketing.sendCampaign(settings);
  }

  return self._transactional.send(settings);
};

/**
 * Build a transactional email without sending it.
 *
 * @param {object} settings - Same as send() transactional settings
 * @returns {object} SendGrid-ready email object
 */
Email.prototype.build = function (settings) {
  return this._transactional.build(settings);
};

/**
 * Add a new contact to enabled marketing providers (lightweight, no full user doc needed).
 *
 * @param {object} options - { email, firstName, lastName, source, customFields }
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Email.prototype.add = function (options) {
  return this._marketing.add(options);
};

/**
 * Sync a user's full data to enabled marketing providers.
 *
 * @param {string|object} userDocOrUid - UID string or full user document from Firestore
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Email.prototype.sync = function (userDocOrUid) {
  return this._marketing.sync(userDocOrUid);
};

/**
 * Remove a contact from all enabled marketing providers.
 *
 * @param {string} email - Email address to remove
 * @returns {{ sendgrid?: object, beehiiv?: object }}
 */
Email.prototype.remove = function (email) {
  return this._marketing.remove(email);
};

/**
 * Cancel a scheduled marketing campaign.
 *
 * @param {string} campaignId - Single Send ID
 * @returns {{ success: boolean, error?: string }}
 */
Email.prototype.cancelCampaign = function (campaignId) {
  return this._marketing.cancelCampaign(campaignId);
};

/**
 * Get a marketing campaign by ID.
 *
 * @param {string} campaignId - Single Send ID
 * @returns {object|null}
 */
Email.prototype.getCampaign = function (campaignId) {
  return this._marketing.getCampaign(campaignId);
};

/**
 * List marketing campaigns.
 *
 * @param {object} [options] - { status: 'draft' | 'scheduled' | 'triggered' }
 * @returns {Array<object>}
 */
Email.prototype.listCampaigns = function (options) {
  return this._marketing.listCampaigns(options);
};

module.exports = Email;
