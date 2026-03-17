const moment = require('moment');

/**
 * Seed marketing campaigns — recurring templates created/enforced on setup.
 *
 * Each seed defines:
 *   - id: Stable Firestore doc ID (prefixed with _ for grouping)
 *   - doc: Full document for initial creation
 *   - enforced: Fields that MUST match on every setup run (overwritten if changed)
 *
 * Fields NOT in `enforced` are only set on creation and never touched again,
 * allowing runtime changes (sendAt advances, status changes, content edits).
 */

/**
 * Get the next occurrence of a specific day of month.
 * @param {number} dayOfMonth - Day (1-31)
 * @param {number} hour - Hour (UTC)
 */
function nextMonthDay(dayOfMonth, hour) {
  const next = moment.utc().startOf('month').date(dayOfMonth).hour(hour);

  // If this month's date has passed, go to next month
  if (next.isBefore(moment.utc())) {
    next.add(1, 'month');
  }

  return next.unix();
}

/**
 * Get the next occurrence of a specific weekday.
 * @param {number} dayOfWeek - 0=Sunday, 1=Monday, ..., 6=Saturday
 * @param {number} hour - Hour (UTC)
 */
function nextWeekday(dayOfWeek, hour) {
  const next = moment.utc().startOf('day').hour(hour);

  while (next.day() !== dayOfWeek || next.isBefore(moment.utc())) {
    next.add(1, 'day');
  }

  return next.unix();
}

function buildSeedCampaigns() {
  const now = moment.utc();
  const nowISO = now.toISOString();
  const nowUNIX = now.unix();

  return [
    {
      id: '_recurring-monthly-sale',
      doc: {
        settings: {
          name: '{holiday.name} Sale',
          subject: '{holiday.name} Sale — Upgrade & Save!',
          preheader: 'Limited time offer from {brand.name}',
          content: [
            '# {holiday.name} Sale',
            '',
            'For a limited time, upgrade your **{brand.name}** plan and save big.',
            '',
            'Don\'t miss out — this offer ends soon!',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_free', 'subscription_cancelled', 'subscription_churned'],
          excludeSegments: ['subscription_paid'],
        },
        sendAt: nextMonthDay(15, 14),
        status: 'pending',
        type: 'email',
        recurrence: {
          pattern: 'monthly',
          day: 15,
          hour: 14,
        },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'recurrence.pattern': 'monthly',
        'recurrence.day': 15,
        'recurrence.hour': 14,
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_free', 'subscription_cancelled', 'subscription_churned'],
        'settings.excludeSegments': ['subscription_paid'],
      },
    },
    {
      id: '_recurring-weekly-newsletter',
      doc: {
        settings: {
          name: 'Weekly Newsletter',
          subject: 'This Week\'s Update',
          preheader: 'News, tips, and updates',
          content: '',
          sender: 'newsletter',
          providers: ['beehiiv'],
        },
        sendAt: nextWeekday(1, 10),
        status: 'pending',
        type: 'email',
        recurrence: {
          pattern: 'weekly',
          hour: 10,
          day: 1,
        },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'recurrence.pattern': 'weekly',
        'recurrence.hour': 10,
        'recurrence.day': 1,
        'settings.providers': ['beehiiv'],
        'settings.sender': 'newsletter',
      },
    },
  ];
}

module.exports = { buildSeedCampaigns };
