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
 * Get the next occurrence of a quarterly date from now.
 * Quarters: Jan 1, Apr 1, Jul 1, Oct 1.
 */
function nextQuarter(hour) {
  const now = moment.utc();
  const quarters = [
    moment.utc({ month: 0, day: 1, hour }),
    moment.utc({ month: 3, day: 1, hour }),
    moment.utc({ month: 6, day: 1, hour }),
    moment.utc({ month: 9, day: 1, hour }),
  ];

  for (const q of quarters) {
    if (q.year(now.year()).isAfter(now)) {
      return q.year(now.year()).unix();
    }
  }

  return quarters[0].year(now.year() + 1).unix();
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
      id: '_recurring-quarterly-sale',
      doc: {
        settings: {
          name: 'Quarterly Sale',
          subject: 'Limited Time — Upgrade & Save!',
          preheader: 'Our biggest discount this quarter',
          content: [
            '# Quarterly Sale',
            '',
            'For a limited time, upgrade your plan and save big.',
            '',
            'Don\'t miss out — this offer ends soon!',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_free'],
          excludeSegments: [],
        },
        sendAt: nextQuarter(14),
        status: 'pending',
        type: 'email',
        recurrence: {
          pattern: 'quarterly',
          hour: 14,
        },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      // Fields enforced on every setup run (deep path → value)
      enforced: {
        'type': 'email',
        'recurrence.pattern': 'quarterly',
        'recurrence.hour': 14,
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_free'],
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
