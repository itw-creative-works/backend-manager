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
 * allowing runtime changes (sendAt advances, recurrence timing, content edits).
 *
 * IDs and names are timing-agnostic so consuming projects can change
 * the recurrence pattern without breaking the ID.
 */

/**
 * Get the next occurrence of a specific day of month.
 * @param {number} dayOfMonth - Day (1-31)
 * @param {number} hour - Hour (UTC)
 */
function nextMonthDay(dayOfMonth, hour) {
  const next = moment.utc().startOf('month').date(dayOfMonth).hour(hour);

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
    // --- Seasonal sale campaigns (one per audience segment) ---
    {
      id: '_recurring-sale-free',
      doc: {
        settings: {
          name: '{holiday.name} Sale — Free Users',
          subject: '{holiday.name} Sale — {discount.percent}% Off!',
          preheader: 'Limited time offer from {brand.name}',
          discountCode: 'UPGRADE15',
          content: [
            '# {holiday.name} Sale',
            '',
            'You\'ve been using **{brand.name}** on our free plan — and we think you\'ll love what\'s on the other side.',
            '',
            'For a limited time, upgrade to Premium and get **{discount.percent}% off** your first month.',
            '',
            'Use code **{discount.code}** at checkout.',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_free'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'free_users' },
        },
        sendAt: nextMonthDay(15, 14),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly', day: 15, hour: 14 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_free'],
        'settings.excludeSegments': ['subscription_paid'],
      },
    },
    {
      id: '_recurring-sale-churned-trial',
      doc: {
        settings: {
          name: '{holiday.name} Sale — Churned Trial',
          subject: 'Your trial ended — come back for {discount.percent}% off!',
          preheader: 'We saved your spot at {brand.name}',
          discountCode: 'FLASH20',
          content: [
            '# Come Back to {brand.name}',
            '',
            'Your free trial may have ended, but we haven\'t forgotten about you.',
            '',
            'For our **{holiday.name}** offer, get **{discount.percent}% off** your first month of Premium.',
            '',
            'Use code **{discount.code}** at checkout.',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_churned_trial'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'churned_trial' },
        },
        sendAt: nextMonthDay(15, 14),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly', day: 15, hour: 14 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_churned_trial'],
        'settings.excludeSegments': ['subscription_paid'],
      },
    },
    {
      id: '_recurring-sale-churned-paid',
      doc: {
        settings: {
          name: '{holiday.name} Sale — Churned Paid',
          subject: 'We miss you — here\'s {discount.percent}% off to come back',
          preheader: '{holiday.name} offer from {brand.name}',
          discountCode: 'MISSYOU25',
          content: [
            '# We Miss You at {brand.name}',
            '',
            'It\'s been a while since you cancelled, and a lot has changed.',
            '',
            'For our **{holiday.name}** offer, get **{discount.percent}% off** your next month.',
            '',
            'Use code **{discount.code}** at checkout.',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_churned_paid'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'churned_paid' },
        },
        sendAt: nextMonthDay(15, 14),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly', day: 15, hour: 14 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_churned_paid'],
        'settings.excludeSegments': ['subscription_paid'],
      },
    },
    {
      id: '_recurring-sale-cancelled',
      doc: {
        settings: {
          name: '{holiday.name} Sale — Cancelled',
          subject: 'Ready to give {brand.name} another try?',
          preheader: '{holiday.name} offer — {discount.percent}% off',
          discountCode: 'TRYAGAIN10',
          content: [
            '# Give {brand.name} Another Try',
            '',
            'We know things didn\'t work out before, and that\'s okay.',
            '',
            'For our **{holiday.name}** offer, get **{discount.percent}% off** your first month back.',
            '',
            'Use code **{discount.code}** at checkout. No pressure — just an open door.',
          ].join('\n'),
          template: 'default',
          sender: 'marketing',
          providers: ['sendgrid'],
          segments: ['subscription_cancelled'],
          excludeSegments: ['subscription_paid', 'subscription_churned_paid', 'subscription_churned_trial'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'cancelled' },
        },
        sendAt: nextMonthDay(15, 14),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly', day: 15, hour: 14 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.providers': ['sendgrid'],
        'settings.sender': 'marketing',
        'settings.segments': ['subscription_cancelled'],
        'settings.excludeSegments': ['subscription_paid', 'subscription_churned_paid', 'subscription_churned_trial'],
      },
    },
    {
      id: '_recurring-newsletter',
      doc: {
        settings: {
          name: '{brand.name} Newsletter — {date.month} {date.year}',
          subject: '',   // Generated by AI
          preheader: '', // Generated by AI
          content: '',  // Generated at send time by newsletter generator
          sender: 'newsletter',
          providers: ['beehiiv'],
          utm: { utm_campaign: 'newsletter_{date.month}_{date.year}', utm_content: 'newsletter' },
        },
        sendAt: nextWeekday(1, 10),
        status: 'pending',
        type: 'email',
        generator: 'newsletter',
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
        'generator': 'newsletter',
        'settings.providers': ['beehiiv'],
        'settings.sender': 'newsletter',
      },
    },
  ];
}

module.exports = { buildSeedCampaigns };
