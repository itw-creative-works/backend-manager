const package = require('../package.json');
const assert = require('assert');

beforeEach(() => {
});

before(() => {
});

after(() => {
});

/*
 * ============
 *  Test Cases
 * ============
 */
describe(`${package.name}`, () => {
  const Manager = (new (require('../src/manager/index.js')));  

  const options = {
    resolveProcessor: true,
    resolveType: true,

    today: '2023-04-28T00:00:00.000Z',
    
    // log: true,
  }

  const defaultProfileOrder = {
    type: 'order',
    details: {
    }
  }

  const defaultProfileSubscription = {
    type: 'subscription',
    details: {
      planFrequency: 'monthly',
    }
  }  

  function log() {
    // console.log(...arguments);
  }

  describe('.subscriptionResolver()', () => {

    /*
      * PAYPAL
    */
    describe('paypal', () => {
      describe('orders', () => {
        describe('regular', () => {
          const item = require('./payment-resolver/paypal/orders/regular.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'order',
            status: 'cancelled',
            frequency: 'single',
            resource: { id: '5CA68427PY850452F' },
            payment: { completed: true },
            start: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            expires: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            cancelled: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            lastPayment: {
              amount: 1,
              date: { timestamp: '2023-04-27T03:40:38.000Z', timestampUNIX: 1682566838 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      describe('subscriptions', () => {
        describe('payment not completed', () => {
          const item = require('./payment-resolver/paypal/subscriptions/payment-not-complete.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'I-6YN0VNT6KM4W' },
            payment: { completed: false },
            start: { timestamp: '2023-05-11T10:52:00.000Z', timestampUNIX: 1683802320 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-05-11T10:52:00.000Z', timestampUNIX: 1683802320 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => in-trial', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-in-trial.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'active',
            frequency: 'annually',
            resource: { id: 'I-HG5K7XD0BVPJ' },
            payment: { completed: true },
            start: { timestamp: '2023-04-28T02:16:58.000Z', timestampUNIX: 1682648218 },
            expires: { timestamp: '2024-06-10T10:00:00.000Z', timestampUNIX: 1718013600 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: { active: true, daysLeft: 13 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'I-VTXGPKDTMMK2' },
            payment: { completed: true },
            start: { timestamp: '2023-04-11T17:37:58.000Z', timestampUNIX: 1681234678 },
            expires: { timestamp: '2024-05-25T10:28:22.000Z', timestampUNIX: 1716632902 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-25T10:28:22.000Z', timestampUNIX: 1682418502 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });        

        describe('trial => cancelled', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'I-79C4RSSVKN95' },
            payment: { completed: true },
            start: { timestamp: '2023-03-31T08:41:35.000Z', timestampUNIX: 1680252095 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-02T23:38:44.000Z', timestampUNIX: 1680478724 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active => cancelled', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-active-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'I-MH92AV4A3EA6' },
            payment: { completed: true },
            start: { timestamp: '2023-03-31T14:48:51.000Z', timestampUNIX: 1680274131 },
            expires: { timestamp: '2023-05-14T10:56:15.000Z', timestampUNIX: 1684061775 },
            cancelled: { timestamp: '2023-04-18T10:14:56.000Z', timestampUNIX: 1681812896 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-14T10:56:15.000Z', timestampUNIX: 1681469775 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });         
      });      
    });

    /*
      * CHARGEBEE
    */
    describe('chargebee', () => {
      describe('orders', () => {
        // describe('regular', () => {
        //   const item = require('./payment-resolver/chargebee/orders/regular.json');
        //   const result = Manager.SubscriptionResolver({}, item).resolve(options);
        //   const expected = {
        //     processor: 'chargebee',
        //     type: 'order',
        //     status: 'cancelled',
        //     frequency: 'single',
        //     resource: { id: '3065' },
        //     payment: { completed: false },
        //     start: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
        //     expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
        //     cancelled: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
        //     lastPayment: {
        //       amount: 0,
        //       date: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 }
        //     },
        //     trial: { active: false, daysLeft: 0 }
        //   }

        //   log('result', result);

        //   it('should resolve correctly', () => {
        //     return assert.deepStrictEqual(result, expected);
        //   });
        // });

        describe('unpaid', () => {
          const item = require('./payment-resolver/chargebee/orders/unpaid.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'order',
            status: 'cancelled',
            frequency: 'single',
            resource: { id: '3065' },
            payment: { completed: false },
            start: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      describe('subscriptions', () => {
        describe('trial => in-trial', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-in-trial.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: '16CRCcTcWmQYKyT5' },
            payment: { completed: true },
            start: { timestamp: '2023-04-26T10:19:48.000Z', timestampUNIX: 1682504388 },
            expires: { timestamp: '2024-06-09T10:19:48.000Z', timestampUNIX: 1717928388 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: { active: true, daysLeft: 12 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-to-active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'AzyfbtTbMhiFM51DW' },
            payment: { completed: true },
            start: { timestamp: '2023-04-14T02:29:56.000Z', timestampUNIX: 1681439396 },
            expires: { timestamp: '2024-05-28T02:29:56.000Z', timestampUNIX: 1716863396 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-28T02:29:56.000Z', timestampUNIX: 1682648996 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => cancelled', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'AzZMshTbnEv7r1Eck' },
            payment: { completed: true },
            start: { timestamp: '2023-04-18T15:24:28.000Z', timestampUNIX: 1681831468 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-25T10:41:02.000Z', timestampUNIX: 1682419262 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active => cancelled', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-to-active-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'AzqJXiTaQKh4m5Ta7' },
            payment: { completed: true },
            start: { timestamp: '2023-04-04T02:53:37.000Z', timestampUNIX: 1680576817 },
            expires: { timestamp: '2023-05-18T02:53:37.000Z', timestampUNIX: 1684378417 },
            cancelled: { timestamp: '2023-04-19T03:42:24.000Z', timestampUNIX: 1681875744 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-18T02:53:37.000Z', timestampUNIX: 1681786417 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });        
      });    

    });

    /*
      * STRIPE
    */
    describe('stripe', () => {
      describe('orders', () => {
        describe('regular', () => {
          const item = require('./payment-resolver/stripe/orders/regular.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'order',
            status: 'cancelled',
            frequency: 'single',
            resource: { id: 'ch_3N1pAXJVFkvVyI7h1FM4wdxL' },
            payment: { completed: true },
            start: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            expires: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            cancelled: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            lastPayment: {
              amount: 1.01,
              date: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      describe('subscriptions', () => {
        describe('trial => in trial', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-in-trial.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'sub_1N1a4yEvB7hJrWnuCzx5ssWK' },
            payment: { completed: true },
            start: { timestamp: '2023-04-27T19:02:08.000Z', timestampUNIX: 1682622128 },
            expires: { timestamp: '2024-06-10T19:02:08.000Z', timestampUNIX: 1718046128 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-27T19:02:08.000Z', timestampUNIX: 1682622128 }
            },
            trial: { active: true, daysLeft: 13 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'sub_1MqedqJVFkvVyI7hYGbJyOFD' },
            payment: { completed: true },
            start: { timestamp: '2023-03-28T15:40:58.000Z', timestampUNIX: 1680018058 },
            expires: { timestamp: '2024-04-27T15:40:58.000Z', timestampUNIX: 1714232458 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 6,
              date: { timestamp: '2023-04-11T15:41:07.000Z', timestampUNIX: 1681227667 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });  

        // ...

        describe('trial => cancelled', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'sub_1Mv9VtCzY9baOpL0I2MRKfoj' },
            payment: { completed: true },
            start: { timestamp: '2023-04-10T01:27:21.000Z', timestampUNIX: 1681090041 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-10T01:27:21.000Z', timestampUNIX: 1681090041 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-10T01:27:21.000Z', timestampUNIX: 1681090041 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });         

        describe('trial => suspended', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-suspended.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'suspended',
            frequency: 'monthly',
            resource: { id: 'sub_1MrOiKCzY9baOpL0TNU5sQZQ' },
            payment: { completed: true },
            start: { timestamp: '2023-03-30T16:52:40.000Z', timestampUNIX: 1680195160 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-13T16:52:51.000Z', timestampUNIX: 1681404771 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });                 
      });    

    });

    /*
      * COINBASE
    */
    describe('coinbase', () => {
      describe('order', () => {
        describe('regular', () => {
          const item = require('./payment-resolver/coinbase/orders/regular.json');
          const result = Manager.SubscriptionResolver(defaultProfileOrder, item).resolve(options);
          const expected = {
            processor: 'coinbase',
            type: 'order',
            status: 'cancelled',
            frequency: 'single',
            resource: { id: '8f783fa6-eaa3-4460-af64-cac26b183ed1' },
            payment: { completed: true },
            start: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            expires: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            cancelled: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            lastPayment: {
              amount: 16,
              date: { timestamp: '2023-04-26T10:06:55.000Z', timestampUNIX: 1682503615 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      describe('subscription', () => {
        describe('active', () => {
          const item = require('./payment-resolver/coinbase/subscriptions/cancelled.json');
          const result = Manager.SubscriptionResolver(defaultProfileSubscription, item).resolve(options);
          const expected = {
            processor: 'coinbase',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: '8f783fa6-eaa3-4460-af64-cac26b183ed1' },
            payment: { completed: true },
            start: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            expires: { timestamp: '2023-05-26T09:59:19.000Z', timestampUNIX: 1685095159 },
            cancelled: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            lastPayment: {
              amount: 16,
              date: { timestamp: '2023-04-26T10:06:55.000Z', timestampUNIX: 1682503615 }
            },
            trial: { active: false, daysLeft: 0 }
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });      
    });    

  });

})
