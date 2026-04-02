/**
 * Abandoned cart reminder configuration (SSOT)
 *
 * Used by:
 * - events/cron/frequent/abandoned-carts.js (processing reminders)
 * - Client-side checkout page (creating cart doc with first delay)
 */
module.exports = {
  // Delays in seconds between reminders: 15m, 3h, 24h, 48h, 72h
  REMINDER_DELAYS: [900, 10800, 86400, 172800, 259200],
  COLLECTION: 'payments-carts',
};
