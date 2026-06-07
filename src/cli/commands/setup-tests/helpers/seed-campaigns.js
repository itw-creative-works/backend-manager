const moment = require('moment');
const { nextWeekday, nextNthWeekday } = require('../../../../manager/libraries/email/constants.js');

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
          template: 'card',
          sender: 'marketing',
          providers: ['campaigns'],
          segments: ['subscription_free'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'free_users' },
          data: {
            content: {
              title: '{holiday.name} Sale!',
              message: [
                'You\'ve been using **{brand.name}** on our free plan — and we think you\'ll love what\'s on the other side.',
                '',
                'For a limited time, upgrade to Premium and get **{discount.percent}% off** your first month.',
                '',
                'Use code **{discount.code}** at checkout.',
              ].join('\n'),
              button: { text: 'Upgrade Now →', url: '{brand.url}/pricing' },
              discountCode: 'UPGRADE15',
            },
          },
        },
        sendAt: nextNthWeekday(2, 3, 17, 30),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly-weekday', nth: 2, day: 3, hour: 17, minute: 30 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.template': 'card',
        'settings.providers': ['campaigns'],
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
          template: 'card',
          sender: 'marketing',
          providers: ['campaigns'],
          segments: ['subscription_churned_trial'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'churned_trial' },
          data: {
            content: {
              title: 'Come Back to {brand.name}!',
              message: [
                'Your free trial may have ended, but we haven\'t forgotten about you.',
                '',
                'For our **{holiday.name}** offer, get **{discount.percent}% off** your first month of Premium.',
                '',
                'Use code **{discount.code}** at checkout.',
              ].join('\n'),
              button: { text: 'Reactivate Now →', url: '{brand.url}/pricing' },
              discountCode: 'COMEBACK20',
            },
          },
        },
        sendAt: nextNthWeekday(2, 3, 17, 30),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly-weekday', nth: 2, day: 3, hour: 17, minute: 30 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.template': 'card',
        'settings.providers': ['campaigns'],
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
          template: 'card',
          sender: 'marketing',
          providers: ['campaigns'],
          segments: ['subscription_churned_paid'],
          excludeSegments: ['subscription_paid'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'churned_paid' },
          data: {
            content: {
              title: 'We Miss You at {brand.name}!',
              message: [
                'It\'s been a while since you cancelled, and a lot has changed.',
                '',
                'For our **{holiday.name}** offer, get **{discount.percent}% off** your next month.',
                '',
                'Use code **{discount.code}** at checkout.',
              ].join('\n'),
              button: { text: 'Come Back →', url: '{brand.url}/pricing' },
              discountCode: 'MISSYOU25',
            },
          },
        },
        sendAt: nextNthWeekday(2, 3, 17, 30),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly-weekday', nth: 2, day: 3, hour: 17, minute: 30 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.template': 'card',
        'settings.providers': ['campaigns'],
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
          template: 'card',
          sender: 'marketing',
          providers: ['campaigns'],
          segments: ['subscription_cancelled'],
          excludeSegments: ['subscription_paid', 'subscription_churned_paid', 'subscription_churned_trial'],
          utm: { utm_campaign: '{holiday.name}_sale', utm_content: 'cancelled' },
          data: {
            content: {
              title: 'Give {brand.name} Another Try!',
              message: [
                'We know things didn\'t work out before, and that\'s okay.',
                '',
                'For our **{holiday.name}** offer, get **{discount.percent}% off** your first month back.',
                '',
                'Use code **{discount.code}** at checkout. No pressure — just an open door.',
              ].join('\n'),
              button: { text: 'Try Again →', url: '{brand.url}/pricing' },
              discountCode: 'TRYAGAIN10',
            },
          },
        },
        sendAt: nextNthWeekday(2, 3, 17, 30),
        status: 'pending',
        type: 'email',
        recurrence: { pattern: 'monthly-weekday', nth: 2, day: 3, hour: 17, minute: 30 },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'settings.template': 'card',
        'settings.providers': ['campaigns'],
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
          subject: '',
          preheader: '',
          sender: 'newsletter',
          providers: ['newsletter'],
          utm: { utm_campaign: 'newsletter_{date.month}_{date.year}', utm_content: 'newsletter' },
        },
        sendAt: nextWeekday(3, 17, 30),
        status: 'pending',
        type: 'email',
        generator: 'newsletter',
        recurrence: {
          pattern: 'weekly',
          day: 3,
          hour: 17,
          minute: 30,
        },
        metadata: {
          created: { timestamp: nowISO, timestampUNIX: nowUNIX },
          updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
        },
      },
      enforced: {
        'type': 'email',
        'generator': 'newsletter',
        'settings.providers': ['newsletter'],
        'settings.sender': 'newsletter',
      },
    },
  ];
}

module.exports = { buildSeedCampaigns };
