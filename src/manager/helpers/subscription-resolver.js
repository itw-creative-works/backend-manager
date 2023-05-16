const moment = require('moment');
const { get } = require('lodash');

function SubscriptionResolver(Manager, profile, resource) {
  const self = this;
  
  self.Manager = Manager;
  self.profile = profile || {};
  self.resource = resource || {};

  return self;
}

SubscriptionResolver.prototype.resolve = function (options) {
  const self = this;

  const resolved = {
    status: '',
    frequency: '',
    resource: {
      id: '',
    },
    payment: {
      completed: false,
    },
    start: {
      timestamp: moment(0),
      timestampUNIX: moment(0),
    },
    expires: {
      timestamp: moment(0),
      timestampUNIX: moment(0),
    },
    cancelled: {
      timestamp: moment(0),
      timestampUNIX: moment(0),
    },        
    lastPayment: {
      amount: 0,
      date: {
        timestamp: moment(0),
        timestampUNIX: moment(0),           
      }
    },
    trial: {
      active: false,
      daysLeft: 0,
    }
  }

  // Set
  const profile = self.profile;
  const resource = self.resource;

  // Set defaults
  profile.type = profile.type || null;
  profile.details = profile.details || {};
  profile.details.planFrequency = profile.details.planFrequency || null;
  
  // Set
  options = options || {};
  options.log = typeof options.log === 'undefined' ? false : options.log;
  options.resolveProcessor = typeof options.resolveProcessor === 'undefined' ? false : options.resolveProcessor;
  options.resolveType = typeof options.resolveType === 'undefined' ? false : options.resolveType;
  options.today = typeof options.today === 'undefined' ? moment() : moment(options.today);

  // Set provider if not set
  if (!profile.processor) {
    /*** PayPal ***/
    // Order    
    if (
      resource.purchase_units
    ) {
      profile.processor = 'paypal';
      profile.type = profile.type || 'order';
    // Subscription    
    } else if (
      // resource.billing_info
      resource.create_time
    ) {
      profile.processor = 'paypal';
      profile.type = profile.type || 'subscription';
    
    /*** Chargebee ***/
    // Order
    } else if (
      resource.line_items
    ) {
      profile.processor = 'chargebee';
      profile.type = profile.type || 'order';
    // Subscription
    } else if (
      resource.billing_period_unit
    ) {
      profile.processor = 'chargebee';
      profile.type = profile.type || 'subscription';

    /*** Stripe ***/
    // Order
    } else if (
      resource.object === 'charge'
    ) {
      profile.processor = 'stripe';
      profile.type = profile.type || 'order';
    // Subscription
    } else if (
      resource.object === 'subscription'
    ) {
      profile.processor = 'stripe';      
      profile.type = profile.type || 'subscription';

    /*** Coinbase ***/
    // Order AND Subscription
    } else if (
      resource.addresses
    ) {
      profile.processor = 'coinbase';
      // profile.type = profile.type || 'subscription';

    /*** Error ***/
    } else {
      throw new Error('Unable to determine subscription provider');
    }
  }

  // Set profile.type
  if (!profile.type) {
    profile.type = profile.type || 'subscription';
  }      

  // Set processor if needed
  if (options.resolveProcessor) {
    resolved.processor = profile.processor;
  }

  // Set type if needed
  if (options.resolveType) {
    resolved.type = profile.type;
  }

  // Set frequency if order
  if (profile.type === 'order') {
    resolved.frequency = 'single';
  }

  // Log if requested
  if (options.log) {
    console.log('profile', profile);
    console.log('resource', resource);
  }  

  // Resolve
  const processor = self[`resolve_${profile.processor}`];
  if (processor) {
    processor(profile, resource, resolved);
  } else {
    throw new Error('Unknown processor');
  }

  // console.log('---resolved', resolved);

  // Check for frequency 
  if (!resolved.frequency) {
    throw new Error('Unknown frequency');
  }

  // Fix expiry by adding time to the date of last payment
  // console.log('----expires 2', resolved.resource.id, resolved.status, resolved.frequency, resolved.trial.active, resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp);
  if (resolved.status === 'active') {
    // Set days left
    if (resolved.trial.active) {
      resolved.trial.daysLeft = resolved.expires.timestamp.diff(options.today, 'days');        
    }

    // Set expiration
    resolved.expires.timestamp.add(1, 'year').add(30, 'days');
  } else {
    // If trial, it's already set to the trial end above
    if (!resolved.trial.active) {
      if (resolved.frequency === 'annually') {
        resolved.expires.timestamp.add(1, 'year');
      } else if (resolved.frequency === 'monthly') {
        resolved.expires.timestamp.add(1, 'month');
      } else if (resolved.frequency === 'weekly') {
        resolved.expires.timestamp.add(1, 'week');        
      } else if (resolved.frequency === 'daily') {
        resolved.expires.timestamp.add(1, 'day');
      }      
    }
  }
  // console.log('----expires 3', resolved.resource.id, resolved.status, resolved.frequency, resolved.trial.active, resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp);

  // If they are not trialing AND there was NEVER any payment sent OR the last payment failed, then set the expiration to 0
  if (
    !resolved.trial.active
    && (!resolved.payment.completed || resolved.lastPayment.amount === 0)
  ) {
    resolved.expires.timestamp = moment(0);
    // resolved.cancelled.timestamp = moment(0);
  }
  // console.log('----expires 4', resolved.resource.id, resolved.status, resolved.frequency, resolved.trial.active, resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp);

  // Fix timestamps
  resolved.start.timestampUNIX = resolved.start.timestamp.unix();
  resolved.start.timestamp = resolved.start.timestamp.toISOString();

  resolved.expires.timestampUNIX = resolved.expires.timestamp.unix();
  resolved.expires.timestamp = resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp;

  resolved.cancelled.timestampUNIX = resolved.cancelled.timestamp.unix();
  resolved.cancelled.timestamp = resolved.cancelled.timestamp.toISOString();  

  // Fix trial days
  resolved.trial.daysLeft = resolved.trial.daysLeft < 0 ? 0 : resolved.trial.daysLeft;

  // Set last payment
  resolved.lastPayment.date.timestampUNIX = moment(resolved.lastPayment.date.timestamp).unix();
  resolved.lastPayment.date.timestamp = resolved.lastPayment.date.timestamp.toISOString();
  
  // Log if needed
  if (options.log) {
    console.log('resolved', resolved);
  }

  self.resolved = resolved;
  // console.log('----expires 5', resolved.resource.id, resolved.status, resolved.frequency, resolved.trial.active, resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp);

  return resolved;  
};

SubscriptionResolver.prototype.resolve_paypal = function (profile, resource, resolved) {
  const self = this;

  // Set status
  /*
    subscription: https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_get
    APPROVAL_PENDING. The subscription is created but not yet approved by the buyer. 
    APPROVED. The buyer has approved the subscription. 
    ACTIVE. The subscription is active. 
    SUSPENDED. The subscription is suspended.
    CANCELLED. The subscription is cancelled. 
    EXPIRED. The subscription is expired.

    order: https://developer.paypal.com/docs/api/orders/v2/#orders_get
    CREATED	The order was created with the specified context.
    SAVED	The order was saved and persisted. The order status continues to be in progress until a capture is made with final_capture = true for all purchase units within the order.
    APPROVED	The customer approved the payment through the PayPal wallet or another form of guest or unbranded payment. For example, a card, bank account, or so on.
    VOIDED	All purchase units in the order are voided.
    COMPLETED	The payment was authorized or the authorized payment was captured for the order.
    PAYER_ACTION_REQUIRED	The order requires an action from the payer (e.g. 3DS authentication). Redirect the payer to the "rel":"payer-action" HATEOAS link returned as part of the response prior to authorizing or capturing the order.
  */
  if (['ACTIVE'].includes(resource.status)) {
    resolved.status = 'active';
  } else if (['SUSPENDED'].includes(resource.status)) {
    resolved.status = 'suspended';
  } else {
    resolved.status = 'cancelled';
  }
  
  // Set resource ID
  resolved.resource.id = resource.id;

  // Set start
  resolved.start.timestamp = moment(
    (
      // Subscription
      get(resource, 'start_time', 0)

      // Order
      || get(resource, 'create_time', 0)
    )
  )

  // Set expiration
  resolved.expires.timestamp = moment(
    (
      // Subscription
      get(resource, 'billing_info.last_payment.time', 0)

      // Order
      || get(resource, 'create_time', 0)
    )
  )

  // Set cancelled
  if (resolved.status === 'cancelled') {
    resolved.cancelled.timestamp = moment(
      (
        // Subscription
        get(resource, 'status_update_time', 0)

        // Order
        || get(resource, 'create_time', 0)
      )
    )
  }

  // Set last payment
  const order = get(resource, 'purchase_units[0].payments.captures[0]');
  const subscription = get(resource, 'billing_info.last_payment');
  if (order) {
    resolved.lastPayment.amount = parseFloat(
      get(order, 'amount.value', '0.00')
    );
    resolved.lastPayment.date.timestamp = moment(
      order.create_time || 0
    );
  } else if (subscription) {
    resolved.lastPayment.amount = parseFloat(subscription.amount.value);
    resolved.lastPayment.date.timestamp = moment(subscription.time);
  }

  // Get trial
  const trialTenure = get(resource, 'plan.billing_cycles', []).find((cycle) => cycle.tenure_type === 'TRIAL');
  const regularTenure = get(resource, 'plan.billing_cycles', []).find((cycle) => cycle.tenure_type === 'REGULAR');

  // Resolve trial
  /* 
    Special condition for PayPal 
    Because you cannot remove trial on a sub-level, you have to charge a prorated amount for the "trial".
    Even if charged, it is still considered a trial period by paypal.
    Thus, we must remove the trial indicator if the user has been charged.
  */
  if (
    resolved.status === 'active'
    && (trialTenure && regularTenure && regularTenure.total_cycles === 0)
    && resolved.lastPayment.amount === 0
  ) {
    resolved.trial.active = true;
    
    // Set expiration
    resolved.expires.timestamp = moment(
      get(resource, 'billing_info.next_billing_time', 0)
    )
  }

  // Resolve frequency
  const unit = get(regularTenure, 'frequency.interval_unit');
  if (unit === 'YEAR') {
    resolved.frequency = 'annually';
  } else if (unit === 'MONTH') {
    resolved.frequency = 'monthly';
  } else if (unit === 'WEEK') {
    resolved.frequency = 'weekly';      
  } else if (unit === 'DAY') {
    resolved.frequency = 'daily';
  }
  
  // Set completed
  if (!resource.plan) {
    resolved.payment.completed = !['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'PAYER_ACTION_REQUIRED'].includes(resource.status);         
  } else {
    resolved.payment.completed = !['APPROVAL_PENDING', 'APPROVED'].includes(resource.status);      
  }

  return resolved;
}

SubscriptionResolver.prototype.resolve_chargebee = function (profile, resource, resolved) {
  const self = this;

  // Set status
  // subscription: https://apidocs.chargebee.com/docs/api/subscriptions?prod_cat_ver=2#subscription_status
  // future The subscription is scheduled to start at a future date. 
  // in_trial The subscription is in trial. 
  // active The subscription is active and will be charged for automatically based on the items in it. 
  // non_renewing The subscription will be canceled at the end of the current term. 
  // paused The subscription is paused. The subscription will not renew while in this state. 
  // cancelled The subscription has been canceled and is no longer in service.

  // order: https://apidocs.chargebee.com/docs/api/invoices?prod_cat_ver=2#invoice_status
  // paid: Indicates a paid invoice.
  // posted: Indicates the payment is not yet collected and will be in this state till the due date to indicate the due period.
  // payment_due: Indicates the payment is not yet collected and is being retried as per retry settings.
  // not_paid: Indicates the payment is not made and all attempts to collect is failed.
  // voided: Indicates a voided invoice.
  // pending: The invoice is yet to be closed (sent for payment collection). An invoice is generated with this status when it has line items that belong to items that are metered or when the subscription.create_pending_invoicesattribute is set to true.  
  
  if (['in_trial', 'active'].includes(resource.status)) {
    resolved.status = 'active';
    
    // If there's a due invoice, it's suspended
    if (resource.total_dues > 0) {
      resolved.status = 'suspended';
    }
  } else if (['paused'].includes(resource.status)) {
    resolved.status = 'suspended';
  } else {
    resolved.status = 'cancelled';
  }

  // Set resource ID
  resolved.resource.id = resource.id;

  // Set start
  resolved.start.timestamp = moment(
    (
      // Order
      get(resource, 'date', 0)      

      // Subscription
      || get(resource, 'created_at', 0)
    ) * 1000    
  )

  // Set expiration
  resolved.expires.timestamp = moment(
    (
      // Order
      get(resource, 'date', 0)

      // Subscription
      || get(resource, 'current_term_start', 0)
    ) * 1000
  )
  // console.log('---resolved.expires 1', resolved.expires);
  // if (resource.total_dues > 0) {
  //   resolved.expires.timestamp = moment(0);
  // } else {
  //   resolved.expires.timestamp = moment(
  //     (
  //       get(resource, 'current_term_start', 0)
  //     ) * 1000
  //   )
  // }

  // Set cancelled
  if (resolved.status === 'cancelled') {
    resolved.cancelled.timestamp = moment(
      (
        // Order
        get(resource, 'date', 0)

        // Subscription
        || get(resource, 'cancelled_at', 0)
      ) * 1000      
    )
  }

  // Set last payment
  if (
    // Order
    resource.amount_due > 0

    // Subscription
    || resource.total_dues > 0
  ) {
    resolved.lastPayment.amount = 0;
    resolved.lastPayment.date.timestamp = moment(
      (
        // Order
        (resource.date || 0)

        // Subscription
        || (resource.due_since || 0)
      ) * 1000
    );
  } else {
    resolved.lastPayment.amount = (
      (
        // Order
        (resource.amount_paid)

        // Order
        || (resource.plan_amount)        
      ) / 100
    )
    resolved.lastPayment.date.timestamp = moment(
      (
        // Order
        (resource.date || 0)

        // Subscription
        || (resource.current_term_start || 0)
      ) * 1000
    );
  }

  // Get trial
  if (resource.status === 'in_trial') {
    resolved.trial.active = true;
    
    // Set expiration
    resolved.expires.timestamp = moment(
      (
        get(resource, 'trial_end', 0)
      ) * 1000
    )
  }

  // Resolve frequency
  const unit = get(resource, 'billing_period_unit');
  if (unit === 'year') {
    resolved.frequency = 'annually';
  } else if (unit === 'month') {
    resolved.frequency = 'monthly';
  } else if (unit === 'week') {
    resolved.frequency = 'weekly';      
  } else if (unit === 'day') {
    resolved.frequency = 'daily';
  }

  // Set completed
  if (profile.type === 'order') {
    resolved.payment.completed = !['posted', 'payment_due', 'not_paid', 'voided', 'pending'].includes(resource.status);
  } else {
    resolved.payment.completed = !['future'].includes(resource.status);
  }

  // Special chargebee reset lastPayment
  // If trial is active OR if it was cancelled after the trial has ended
  const trialEnd = get(resource, 'trial_end', 0);
  const cancelledAt = get(resource, 'cancelled_at', 0);
  if (
    resolved.trial.active
    || (trialEnd > 0 && cancelledAt > 0 && cancelledAt === trialEnd)
  ) {
    resolved.lastPayment.amount = 0;
    resolved.lastPayment.date.timestamp = moment(0);
  }

  // console.log('----expires 1', resolved.resource.id, resolved.status, resolved.frequency, resolved.trial.active, resolved.expires.timestamp.toISOString ? resolved.expires.timestamp.toISOString() : resolved.expires.timestamp);

  return resolved;
}

SubscriptionResolver.prototype.resolve_stripe = function (profile, resource, resolved) {
  const self = this;

  // Subscription: https://stripe.com/docs/api/subscriptions/object#subscription_object-status
  // incomplete
  // incomplete_expired
  // trialing
  // active
  // past_due
  // canceled
  // unpaid

  // Charge: https://stripe.com/docs/api/payment_intents/object#payment_intent_object-status
  // requires_payment_method
  // requires_confirmation
  // requires_action
  // processing
  // requires_capture
  // canceled
  // succeeded
  // Set status
  if (['trialing', 'active'].includes(resource.status)) {
    resolved.status = 'active';
  } else if (['past_due', 'unpaid'].includes(resource.status)) {
    resolved.status = 'suspended';
  } else {
    resolved.status = 'cancelled';
  }

  // Set resource ID
  resolved.resource.id = resource.id;

  // Set start
  resolved.start.timestamp = moment(
    (
      // Order
      get(resource, 'created', 0)

      // Subscription
      || get(resource, 'start_date', 0)
    ) * 1000
  );
  
  // Set expiration
  resolved.expires.timestamp = moment(
    (
      // Order
      get(resource, 'created', 0)

      // Subscription
      || get(resource, 'current_period_start', 0)
    ) * 1000
  );

  // Set cancelled
  if (resolved.status === 'cancelled') {
    resolved.cancelled.timestamp = moment(
      (
        // Order
        get(resource, 'created', 0)

        // Subscription
        || get(resource, 'canceled_at', 0)
      ) * 1000
    )
  }    

  // Set last payment
  // TODO: check if suspended payments are handled correctly when using resource.latest_invoice.amount_paid
  const order = resource.object === 'charge' ? resource : null;
  const subscription = get(resource, 'latest_invoice');
  if (order) {
    resolved.lastPayment.amount = order.amount_captured / 100;
    resolved.lastPayment.date.timestamp = moment(
      (order.created || 0) * 1000
    );    
  } else if (subscription) {
    resolved.lastPayment.amount = subscription.amount_paid / 100;
    resolved.lastPayment.date.timestamp = moment(
      (subscription.created || 0) * 1000
    );
  }    

  // Get trial
  if (resource.status === 'trialing') {
    resolved.trial.active = true;

    // Set expiration
    resolved.expires.timestamp = moment(
      (
        get(resource, 'trial_end', 0)
      ) * 1000
    )
  }

  // Resolve frequency
  const unit = get(resource, 'plan.interval');
  if (unit === 'year') {
    resolved.frequency = 'annually';
  } else if (unit === 'month') {
    resolved.frequency = 'monthly';
  } else if (unit === 'week') {
    resolved.frequency = 'weekly';      
  } else if (unit === 'day') {
    resolved.frequency = 'daily';
  }

  // Set completed
  if (resource.object === 'charge') {
    resolved.payment.completed = !['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled'].includes(resource.status);      
  } else {
    resolved.payment.completed = !['incomplete', 'incomplete_expired'].includes(resource.status);      
  }

  return resolved;
}

SubscriptionResolver.prototype.resolve_coinbase = function (profile, resource, resolved) {
  const self = this;

  // Set status
  resolved.status = 'cancelled';

  // Set resource ID
  resolved.resource.id = resource.id;

  // Set start
  resolved.start.timestamp = moment(
    get(resource, 'created_at', 0)
  );

  // Set expiration
  resolved.expires.timestamp = moment(
    get(resource, 'created_at', 0)
  );

  // Set cancelled
  resolved.cancelled.timestamp = moment(
    get(resource, 'created_at', 0)
  )

  // Retrieve last payment
  const lastPayment = resource.payments.find(p => p.status === 'CONFIRMED');

  // Set last payment
  if (lastPayment) {
    resolved.lastPayment.amount = parseFloat(lastPayment.value.local.amount);
    resolved.lastPayment.date.timestamp = moment(lastPayment.detected_at);
  }

  // Get trial
  if (true) {
    resolved.trial.active = false;
  }

  // Resolve frequency
  const unit = profile.details.planFrequency;
  if (unit) {
    resolved.frequency = unit;
  } else {
    resolved.frequency = 'single';
  }

  // Set completed
  if (true) {
    resolved.payment.completed = !!lastPayment;
  }

  return resolved;
}

module.exports = SubscriptionResolver;
