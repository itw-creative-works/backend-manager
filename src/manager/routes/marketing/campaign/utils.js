/**
 * Shared utilities for marketing campaign routes.
 */
const _ = require('lodash');
const moment = require('moment');

// Fields that live at the doc level, not inside doc.settings
const DOC_LEVEL_FIELDS = ['id', 'sendAt', 'type', 'recurrence', 'generator'];

/**
 * Separate settings into doc-level fields and nested settings.
 * Returns { docFields, campaignSettings }.
 */
function buildCampaignDoc(settings) {
  const now = moment();

  // Extract doc-level fields
  const sendAt = normalizeSendAt(settings.sendAt, now);
  const type = settings.type || 'email';

  const docFields = {
    sendAt,
    type,
    ...(settings.recurrence ? { recurrence: settings.recurrence } : {}),
    ...(settings.generator ? { generator: settings.generator } : {}),
  };

  // Everything else goes into doc.settings — strip empties
  const campaignSettings = _.omitBy(
    _.omit(settings, DOC_LEVEL_FIELDS),
    (v) => v === undefined || v === '' || (Array.isArray(v) && !v.length) || (_.isPlainObject(v) && !Object.keys(v).length),
  );

  return { docFields, campaignSettings, now };
}

/**
 * Normalize sendAt to unix timestamp.
 * Accepts: 'now', ISO string, unix timestamp (number or string), undefined/empty.
 */
function normalizeSendAt(sendAt, now) {
  if (!sendAt || sendAt === 'now') {
    return (now || moment()).unix();
  }

  if (typeof sendAt === 'number') {
    return sendAt;
  }

  if (/^\d+$/.test(sendAt)) {
    return parseInt(sendAt, 10);
  }

  const parsed = moment(sendAt);
  return parsed.isValid() ? parsed.unix() : (now || moment()).unix();
}

module.exports = { DOC_LEVEL_FIELDS, buildCampaignDoc, normalizeSendAt };
