/**
 * Order email template — handles ALL order event types in one file.
 *
 * Event type comes from data.content.event (e.g. 'confirmation', 'payment-failed', 'cancelled').
 *
 * Sections:
 *   _header()      — emoji + title + subtitle
 *   _summary()     — product/price/discount/total table
 *   _details()     — date, processor, frequency, account
 *   _explanation() — conditional paragraphs (trial, promo, cancellation, etc.)
 *   _ctaButton()   — dashboard/billing/pricing CTA
 *   _helpText()    — "Questions? Contact support"
 */
const { skeleton, logo, cardWrapper, signoff, footer, escape } = require('./base.js');
const { resolveTheme } = require('./shared-campaign.js');

const PROCESSOR_NAMES = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  chargebee: 'Chargebee',
  coinbase: 'Coinbase',
};

// Events that show the price summary table
const SUMMARY_EVENTS = ['confirmation', 'payment-failed', 'payment-recovered', 'trial-ending', 'plan-changed', 'refunded', 'abandoned-cart'];

function build({ data, theme: themeIn, templateName }) {
  const theme = resolveTheme(themeIn);
  const brand = data?.brand || {};
  const email = data?.email || {};
  const order = data?.content || {};
  const event = order.event || 'confirmation';

  return skeleton({ subject: email.subject, preview: email.preview, categories: email.categories }, `
    ${logo(brand, theme)}
    ${cardWrapper(`
        ${_header(event, order, data)}
        ${_summary(event, order, data, theme)}
        ${_details(event, order, data)}
        ${_explanation(event, order, data, brand)}
        ${_ctaButton(event, brand, order)}
        ${_helpText(brand)}
        ${signoff(data, theme)}
    `)}
    ${footer(brand, email)}
  `);
}

// ============================================================
// Sections
// ============================================================

function _header(event, order, data) {
  const name = data?.personalization?.name;
  const isSubscription = order.type === 'subscription';
  const isTrial = order.unified?.trial?.claimed;

  const variants = {
    'confirmation': {
      emoji: '&#127881;',
      title: isSubscription ? 'Your subscription is confirmed!' : 'Your order is confirmed!',
      subtitle: isSubscription
        ? `${name ? `Hey ${escape(name)}, thanks` : 'Thanks'} for subscribing. Here's a summary of your order.`
        : `${name ? `Hey ${escape(name)}, thanks` : 'Thanks'} for your purchase. Here's your receipt.`,
    },
    'payment-failed': {
      emoji: '&#9888;&#65039;',
      title: 'Payment failed',
      subtitle: `${name ? `Hey ${escape(name)}, we` : 'We'} were unable to process your payment.`,
    },
    'payment-recovered': {
      emoji: '&#9989;',
      title: 'Payment successful',
      subtitle: 'Your payment has been processed and your access has been restored.',
    },
    'cancellation-requested': {
      emoji: '&#128197;',
      title: 'Cancellation confirmed',
      subtitle: 'Your subscription has been scheduled for cancellation.',
    },
    'cancelled': {
      emoji: '&#10060;',
      title: 'Subscription cancelled',
      subtitle: isTrial
        ? 'Your free trial has been cancelled.'
        : 'Your subscription has been cancelled.',
    },
    'plan-changed': {
      emoji: '&#128260;',
      title: 'Plan updated',
      subtitle: 'Your subscription plan has been changed.',
    },
    'trial-ending': {
      emoji: '&#9200;',
      title: 'Your free trial is ending soon',
      subtitle: 'Your trial period is almost over.',
    },
    'refunded': {
      emoji: '&#128176;',
      title: 'Payment refunded',
      subtitle: 'Your refund has been processed.',
    },
    'abandoned-cart': {
      emoji: '&#128562;',
      title: 'You left something behind!',
      subtitle: 'Your cart is still waiting for you.',
    },
  };

  const v = variants[event] || variants['confirmation'];

  return `
        <mj-text padding="0" align="center">
          <p style="font-size: 48px; line-height: 1; margin: 0 0 12px;">${v.emoji}</p>
          <h2 style="font-size: 32px; line-height: 1.2; font-weight: 500; margin: 0 0 8px;">${v.title}</h2>
          <p style="font-weight: 700; color: #718096; margin: 0 0 8px;">Order #${escape(order.id || '')}</p>
          <p style="color: #718096; margin: 0 0 0;">${v.subtitle}</p>
        </mj-text>`;
}

function _summary(event, order, data, theme) {
  if (!SUMMARY_EVENTS.includes(event)) {
    return '';
  }
  if (event === 'abandoned-cart') {
    return _abandonedCartSummary(order, data, theme);
  }
  if (event === 'refunded') {
    return _refundSummary(order, theme);
  }
  if (event === 'plan-changed') {
    return _planChangedSummary(order, data, theme);
  }

  const unified = order.unified || {};
  const product = unified.product || {};
  const payment = unified.payment || {};
  const computed = order._computed || {};
  const brandName = data?.brand?.name || '';
  const isSubscription = order.type === 'subscription';

  const rows = [];

  if (product.name) {
    const label = isSubscription
      ? `<strong>${escape(brandName)} ${escape(product.name)}</strong><br/><span style="color: #888; font-size: 13px;">Billed ${escape(payment.frequency || '')}</span>`
      : `<strong>Order #${escape(order.id || '')}</strong>`;
    const price = payment.price != null ? `<strong>$${payment.price}</strong>` : '';
    rows.push(_row(label, price));
  }

  if (unified.trial?.claimed) {
    rows.push(_row(
      '<span style="color: #16a34a;">Free trial discount</span>',
      `<span style="color: #16a34a;">&minus;$${payment.price || 0}</span>`,
    ));
  }

  if (computed.promoCode) {
    rows.push(_row(
      `<span style="color: #16a34a;">${escape(computed.promoCode)} &ndash; ${computed.promoPercent}% off</span>`,
      `<span style="color: #16a34a;">&minus;$${computed.promoSavings || '0.00'}</span>`,
    ));
  }

  if (computed.totalToday != null) {
    rows.push(`<tr><td style="padding: 8px 0 4px 0; border-top: 1px solid #e5e7eb;"><strong>Total paid today</strong></td><td style="padding: 8px 0 4px 0; border-top: 1px solid #e5e7eb; text-align: right; white-space: nowrap;"><strong style="font-size: 18px;">$${computed.totalToday}</strong></td></tr>`);
  }

  if (!rows.length) {
    return '';
  }

  return _sectionLabel('SUMMARY') + _tableCard(rows, theme);
}

function _details(event, order, data) {
  if (event === 'abandoned-cart') {
    return '';
  }

  const computed = order._computed || {};
  const payment = order.unified?.payment || {};
  const isSubscription = order.type === 'subscription';
  const userEmail = data?.personalization?.email || data?.user?.auth?.email || '';

  const rows = [];

  if (computed.date) {
    rows.push(_detailRow('Date', computed.date));
  }

  const processorName = PROCESSOR_NAMES[order.processor] || PROCESSOR_NAMES[payment.processor] || 'Other';
  rows.push(_detailRow('Payment', processorName));

  if (isSubscription && payment.frequency) {
    const freq = payment.frequency === 'annually' ? 'Annually'
      : payment.frequency === 'monthly' ? 'Monthly'
        : payment.frequency;
    rows.push(_detailRow('Frequency', freq));
  }

  if (userEmail) {
    rows.push(_detailRow('Account', escape(userEmail)));
  }

  if (event === 'refunded' && computed.refundReason) {
    rows.push(_detailRow('Reason', escape(computed.refundReason)));
  }

  if (event === 'cancelled' && computed.expiresDate) {
    rows.push(_detailRow('Access until', computed.expiresDate));
  }

  return _sectionLabel('DETAILS') + _tableCard(rows, null);
}

function _explanation(event, order, data, brand) {
  const computed = order._computed || {};
  const payment = order.unified?.payment || {};
  const isTrial = order.unified?.trial?.claimed;
  const brandName = brand?.name || '';
  const brandUrl = brand?.url || '#';
  const productName = order.unified?.product?.name || '';
  const promoNote = computed.promoCode ? ' Discount code applies to first payment only.' : '';
  const chargeAmount = computed.firstChargeAmount || payment.price || '0.00';

  let html = '';

  switch (event) {
    case 'confirmation':
      if (order.type === 'subscription') {
        if (isTrial) {
          html = `<p style="color: #718096;">Your free trial is active until <strong>${escape(computed.trialExpires || '')}</strong>. You may cancel at any time before then and you will not be charged. After your trial ends, your paid subscription will automatically begin and you will be charged <strong>$${chargeAmount}/${escape(payment.frequency || '')}</strong>.${promoNote}</p>
          <p style="color: #718096;">If you cancel your subscription during the free trial period, you will be immediately downgraded to a basic account and <strong>lose access to all premium features</strong>. You can <a href="${brandUrl}/account#billing">cancel your subscription</a> at any time on our website.</p>`;
        } else {
          html = `<p style="color: #718096;">Your subscription to <strong>${escape(brandName)} ${escape(productName)}</strong> is now active. You'll be billed <strong>$${payment.price}/${escape(payment.frequency || '')}</strong> going forward.${promoNote} You can manage or cancel your subscription anytime from your <a href="${brandUrl}/account#billing">account</a>.</p>`;
        }
      } else {
        html = `<p style="color: #718096;">Your payment of <strong>$${payment.price || computed.totalToday || '0.00'}</strong> has been processed successfully. You can view your order details and access your purchase from your <a href="${brandUrl}/account">account</a>.</p>`;
      }
      break;

    case 'payment-failed':
      html = `<p style="color: #718096;">Your payment method was declined. Your access has been suspended, but your subscription is <strong>not cancelled</strong> &mdash; charges will continue to accrue.</p>
      <p style="color: #718096;">Please update your payment method to restore access.</p>`;
      break;

    case 'payment-recovered':
      html = `<p style="color: #718096;">Your payment has been processed successfully and your access has been restored. Your subscription is now active again.</p>`;
      break;

    case 'cancellation-requested':
      html = `<p style="color: #718096;">Your subscription is scheduled for cancellation at the end of your current billing period. You'll continue to have access until <strong>${escape(computed.cancellationDate || '')}</strong>.</p>
      <p style="color: #718096;">Changed your mind? You can reactivate your subscription anytime before that date from your <a href="${brandUrl}/account#billing">account</a>.</p>`;
      break;

    case 'cancelled':
      if (isTrial) {
        html = `<p style="color: #718096;">Your free trial has been cancelled. You've been downgraded to a basic account. To re-subscribe, visit our <a href="${brandUrl}/pricing">pricing page</a>.</p>`;
      } else if (computed.expiresDate) {
        html = `<p style="color: #718096;">Your subscription has been cancelled. You'll continue to have access until <strong>${escape(computed.expiresDate)}</strong>. After that, you'll be downgraded to a basic account.</p>`;
      } else {
        html = `<p style="color: #718096;">Your subscription has been cancelled and your access has been revoked immediately.</p>`;
      }
      html += `<p style="color: #718096;">We're sorry to see you go. If you'd like to come back, you can re-subscribe anytime.</p>`;
      break;

    case 'plan-changed': {
      const prev = order.unified?.previous;
      const prevName = prev?.product?.name || '';
      html = `<p style="color: #718096;">Your plan has been changed${prevName ? ` from <strong>${escape(brandName)} ${escape(prevName)}</strong>` : ''} to <strong>${escape(brandName)} ${escape(productName)}</strong> at <strong>$${payment.price}/${escape(payment.frequency || '')}</strong>. The change is effective immediately.</p>`;
      break;
    }

    case 'trial-ending':
      html = `<p style="color: #718096;">Your free trial ends on <strong>${escape(computed.trialExpires || '')}</strong>. After that, you will be charged <strong>$${chargeAmount}/${escape(payment.frequency || '')}</strong> automatically.</p>
      <p style="color: #718096;">If you don't want to be charged, <a href="${brandUrl}/account#billing">cancel your subscription</a> before your trial ends. After your trial, no full refund will be issued.</p>`;
      break;

    case 'refunded':
      html = `<p style="color: #718096;">A refund of <strong>$${escape(computed.refundAmount || computed.totalToday || '0.00')}</strong> has been processed and will appear on your statement within 5&ndash;10 business days.</p>`;
      break;

    case 'abandoned-cart': {
      const reminderN = computed.reminderNumber || 1;
      if (reminderN === 1) {
        html = `<p style="color: #718096;">Your cart is still saved and we have a special discount waiting for you!</p>`;
      } else if (reminderN >= 5) {
        html = `<p style="color: #718096;">This is your last reminder &mdash; your cart and discount are still waiting for you.</p>`;
      } else {
        html = `<p style="color: #718096;">Just a friendly reminder &mdash; your checkout is still waiting for you.</p>`;
      }
      break;
    }
  }

  if (!html) {
    return '';
  }

  return `<mj-text padding="16px 0 0 0">${html}</mj-text>`;
}

function _ctaButton(event, brand, order) {
  const brandUrl = brand?.url || '#';

  const variants = {
    'confirmation': { text: 'Go to your dashboard &rarr;', url: `${brandUrl}/account` },
    'payment-failed': { text: 'Update payment method &rarr;', url: `${brandUrl}/account#billing` },
    'payment-recovered': { text: 'Go to your dashboard &rarr;', url: `${brandUrl}/account` },
    'cancellation-requested': { text: 'Manage subscription &rarr;', url: `${brandUrl}/account#billing` },
    'cancelled': { text: 'Re-subscribe &rarr;', url: `${brandUrl}/pricing` },
    'plan-changed': { text: 'Go to your dashboard &rarr;', url: `${brandUrl}/account` },
    'trial-ending': { text: 'Manage subscription &rarr;', url: `${brandUrl}/account#billing` },
    'refunded': { text: 'Go to your account &rarr;', url: `${brandUrl}/account` },
    'abandoned-cart': { text: 'Complete checkout &rarr;', url: order._computed?.checkoutUrl || `${brandUrl}/pricing` },
  };

  const v = variants[event] || variants['confirmation'];

  return `<mj-button href="${v.url}" background-color="#1A202C" color="#ffffff" border-radius="4px" font-size="16px" font-weight="normal" inner-padding="10px 20px" padding="24px 0 0 0">${v.text}</mj-button>`;
}

function _helpText(brand) {
  const brandUrl = brand?.url || '#';

  return `
        <mj-text padding="16px 0 0 0" align="center">
          <p style="color: #718096; margin: 0;">Questions about your order? <a href="${brandUrl}/support">Contact our support team</a>.</p>
        </mj-text>`;
}

// ============================================================
// Variant summary builders
// ============================================================

function _refundSummary(order, theme) {
  const computed = order._computed || {};
  const amount = computed.refundAmount || computed.totalToday || '0.00';

  const rows = [
    `<tr><td style="padding: 4px 0;"><strong>Refund amount</strong></td><td style="padding: 4px 0; text-align: right; white-space: nowrap;"><strong style="font-size: 18px; color: #16a34a;">$${amount}</strong></td></tr>`,
  ];

  return _sectionLabel('REFUND SUMMARY') + _tableCard(rows, theme);
}

function _planChangedSummary(order, data, theme) {
  const payment = order.unified?.payment || {};
  const brandName = data?.brand?.name || '';
  const productName = order.unified?.product?.name || '';
  const prev = order.unified?.previous;

  const rows = [];

  if (prev?.product?.name) {
    const prevFreq = payment.frequency ? `/${escape(payment.frequency)}` : '';
    rows.push(_row(
      `<span style="text-decoration: line-through; color: #888;">${escape(brandName)} ${escape(prev.product.name)}</span>`,
      prev.price != null
        ? `<span style="text-decoration: line-through; color: #888;">$${prev.price}${prevFreq}</span>`
        : '',
    ));
  }

  rows.push(_row(
    `<strong>${escape(brandName)} ${escape(productName)}</strong>`,
    payment.price != null ? `<strong>$${payment.price}/${escape(payment.frequency || '')}</strong>` : '',
  ));

  return _sectionLabel('SUMMARY') + _tableCard(rows, theme);
}

function _abandonedCartSummary(order, data, theme) {
  const payment = order.unified?.payment || {};
  const product = order.unified?.product || {};
  const brandName = data?.brand?.name || '';

  const rows = [];

  if (product.name) {
    rows.push(_row(
      `<strong>${escape(brandName)} ${escape(product.name)}</strong>`,
      payment.price != null ? `<strong>$${payment.price}</strong>` : '',
    ));
  }

  return _sectionLabel('YOUR CART') + _tableCard(rows, theme);
}

// ============================================================
// Primitives
// ============================================================

function _sectionLabel(text) {
  return `
        <mj-text padding="24px 0 8px 0">
          <p style="font-weight: 700; font-size: 12px; color: #718096; letter-spacing: 0.5px; margin: 0;">${text}</p>
        </mj-text>`;
}

function _tableCard(rows, theme) {
  const bg = theme?.accentColor || '#F7FAFC';
  return `
        <mj-text padding="0">
          <div style="background-color: ${bg}; border-radius: 8px; padding: 16px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">${rows.join('')}</table>
          </div>
        </mj-text>`;
}

function _row(left, right) {
  return `<tr><td style="padding: 4px 0;">${left}</td><td style="padding: 4px 0; text-align: right; white-space: nowrap;">${right}</td></tr>`;
}

function _detailRow(label, value) {
  return `<tr><td style="padding: 4px 0; color: #718096; white-space: nowrap;">${escape(label)}</td><td style="padding: 4px 0; text-align: right; white-space: nowrap;">${value}</td></tr>`;
}

const meta = {
  name: 'order',
  description: 'Order email — handles all order event types with componentized sections',
};

module.exports = { build, meta };
