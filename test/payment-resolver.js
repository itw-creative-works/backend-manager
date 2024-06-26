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
    // today: '2023-08-28T00:00:00.000Z',

    // log: true,

    message: false,
  }

  const defaultProfileOrder = {
    type: 'order',
    details: {
    }
  }

  const profileSubscriptionDefault = {
    type: 'subscription',
    details: {
      planFrequency: 'monthly',
    }
  }

  const profileSubscriptionFailedAuthorization = {
    type: 'subscription',
    details: {
      planFrequency: 'monthly',
    },
    authorization: {
      status: 'failed',
    }
  }

  function log() {
    // console.log(...arguments);
  }

  describe('.subscriptionResolver()', () => {

    /*
      GENERIC
    */
    // describe('error test', () => {
    //   const result = Manager.SubscriptionResolver({}, new Error('Test')).resolve(options);

    //   console.log('result', result);

    //   it('should resolve correctly', () => {
    //     return assert.deepStrictEqual(result, expected);
    //   });
    // });

    /*
      * PAYPAL
    */
    describe('paypal', () => {
      // Orders
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            expires: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            cancelled: { timestamp: '2023-04-27T03:39:50.000Z', timestampUNIX: 1682566790 },
            lastPayment: {
              amount: 1,
              date: { timestamp: '2023-04-27T03:40:38.000Z', timestampUNIX: 1682566838 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      // Subscriptions
      describe('subscriptions', () => {
        describe('active', () => {
          const item = require('./payment-resolver/paypal/subscriptions/active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'I-GLYNACJCERDD' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-22T22:38:03.000Z', timestampUNIX: 1679524683 },
            expires: { timestamp: '2024-09-21T11:03:15.000Z', timestampUNIX: 1726916595 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 59.85,
              date: { timestamp: '2023-08-22T11:03:15.000Z', timestampUNIX: 1692702195 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('active => refund previous stmnt', () => {
          const item = require('./payment-resolver/paypal/subscriptions/active-refund-previous-stmnt.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'I-PXC8BVN91X5W' },
            payment: {
              completed: true,
              refunded: true,
            },
            start: { timestamp: '2023-02-12T13:34:46.000Z', timestampUNIX: 1676208886 },
            expires: { timestamp: '2025-02-11T10:29:45.000Z', timestampUNIX: 1739269785 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2024-01-12T10:29:45.000Z', timestampUNIX: 1705055385 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-28T02:16:58.000Z', timestampUNIX: 1682648218 },
            expires: { timestamp: '2024-06-10T10:00:00.000Z', timestampUNIX: 1718013600 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: true,
              claimed: true,
              daysLeft: 13,
              expires: {
                timestamp: '2023-05-12T02:16:58.000Z',
                timestampUNIX: 1683857818,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => payment not completed', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-payment-not-complete.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'I-6YN0VNT6KM4W' },
            payment: {
              completed: false,
              refunded: false,
            },
            start: { timestamp: '2023-05-11T10:52:00.000Z', timestampUNIX: 1683802320 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => payment overdue', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-payment-overdue.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'suspended',
            frequency: 'annually',
            resource: { id: 'I-PFLFF5TTAN4S' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-09-09T05:58:41.000Z', timestampUNIX: 1694239121 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => payment overdue (2)', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-payment-overdue-2.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'suspended',
            frequency: 'annually',
            resource: { id: 'I-JU1H0XF32WU5' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-09-08T07:15:10.000Z', timestampUNIX: 1694157310 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-31T14:48:51.000Z', timestampUNIX: 1680274131 },
            expires: { timestamp: '2023-05-14T10:56:15.000Z', timestampUNIX: 1684061775 },
            cancelled: { timestamp: '2023-04-18T10:14:56.000Z', timestampUNIX: 1681812896 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-14T10:56:15.000Z', timestampUNIX: 1681469775 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-11T17:37:58.000Z', timestampUNIX: 1681234678 },
            expires: { timestamp: '2024-05-25T10:28:22.000Z', timestampUNIX: 1716632902 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-25T10:28:22.000Z', timestampUNIX: 1682418502 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-31T08:41:35.000Z', timestampUNIX: 1680252095 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-02T23:38:44.000Z', timestampUNIX: 1680478724 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => expired', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-expired.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'I-BC83SG8TF205' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-06-05T15:16:16.000Z', timestampUNIX: 1685978176 },
            expires: { timestamp: '2023-07-05T15:16:31.000Z', timestampUNIX: 1688570191 },
            cancelled: { timestamp: '2023-06-05T15:16:33.000Z', timestampUNIX: 1685978193 },
            lastPayment: {
              amount: 3,
              date: { timestamp: '2023-06-05T15:16:31.000Z', timestampUNIX: 1685978191 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => refund', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-refund.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'annually',
            resource: { id: 'I-JW7F1RK5KN8W' },
            payment: {
              completed: true,
              refunded: true,
            },
            start: { timestamp: '2023-07-17T14:31:50.000Z', timestampUNIX: 1689604310 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-07-31T11:33:32.000Z', timestampUNIX: 1690803212 },
            lastPayment: {
              amount: 191.4,
              date: { timestamp: '2023-07-31T11:13:59.000Z', timestampUNIX: 1690802039 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => suspended', () => {
          const item = require('./payment-resolver/paypal/subscriptions/trial-to-suspended.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'paypal',
            type: 'subscription',
            status: 'suspended',
            frequency: 'monthly',
            resource: { id: 'I-A3AS9XBE0JEG' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-07-11T16:52:11.000Z', timestampUNIX: 1689094331 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 9.97,
              date: { timestamp: '2023-07-11T16:53:50.000Z', timestampUNIX: 1689094430 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
      // Orders
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
        //     payment: {
        //         completed: false,
        //         refunded: false,
        //       },
        //     start: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
        //     expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
        //     cancelled: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
        //     lastPayment: {
        //       amount: 0,
        //       date: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 }
        //     },
        //     trial: {
        //       active: false,
        //       claimed: false,
        //       daysLeft: 0,
        //       expires: {
        //         timestamp: '1970-01-01T00:00:00.000Z',
        //         timestampUNIX: 0,
        //       },
        //     },
        //     details: {
        //       message: '[REDACTED]',
        //     },
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
            payment: {
              completed: false,
              refunded: false,
            },
            start: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-27T09:34:43.000Z', timestampUNIX: 1682588083 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      // Subscriptions
      describe('subscriptions', () => {
        describe('active', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'AzZMxvTYTQUmw1Iw7' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-14T10:37:33.000Z', timestampUNIX: 1678790253 },
            expires: { timestamp: '2024-09-13T10:37:33.000Z', timestampUNIX: 1726223853 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-08-14T10:37:33.000Z', timestampUNIX: 1692009453 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => skipped-to-active', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-skipped-to-active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: '6oqX0TnhKo5R513B' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-08-22T20:55:52.000Z', timestampUNIX: 1692737752 },
            expires: { timestamp: '2024-09-21T20:55:57.000Z', timestampUNIX: 1726952157 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-08-22T20:55:57.000Z', timestampUNIX: 1692737757 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => in-trial', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-in-trial.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: '16CRCcTcWmQYKyT5' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-26T10:19:48.000Z', timestampUNIX: 1682504388 },
            expires: { timestamp: '2024-06-09T10:19:48.000Z', timestampUNIX: 1717928388 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: true,
              claimed: true,
              daysLeft: 12,
              expires: {
                timestamp: '2023-05-10T10:19:48.000Z',
                timestampUNIX: 1683713988,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-04T02:53:37.000Z', timestampUNIX: 1680576817 },
            expires: { timestamp: '2023-05-18T02:53:37.000Z', timestampUNIX: 1684378417 },
            cancelled: { timestamp: '2023-04-19T03:42:24.000Z', timestampUNIX: 1681875744 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-18T02:53:37.000Z', timestampUNIX: 1681786417 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-14T02:29:56.000Z', timestampUNIX: 1681439396 },
            expires: { timestamp: '2024-05-28T02:29:56.000Z', timestampUNIX: 1716863396 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-04-28T02:29:56.000Z', timestampUNIX: 1682648996 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-18T15:24:28.000Z', timestampUNIX: 1681831468 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-25T10:41:02.000Z', timestampUNIX: 1682419262 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => refund', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-to-refund.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'AzymDoTjgzDShlvd' },
            payment: {
              completed: true,
              refunded: true,
            },
            start: { timestamp: '2023-07-11T09:37:47.000Z', timestampUNIX: 1689068267 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-07-15T13:23:15.000Z', timestampUNIX: 1689427395 },
            lastPayment: {
              amount: 19.95,
              date: { timestamp: '2023-07-11T09:37:54.000Z', timestampUNIX: 1689068274 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => suspendeded', () => {
          const item = require('./payment-resolver/chargebee/subscriptions/trial-to-suspended.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'chargebee',
            type: 'subscription',
            status: 'suspended',
            frequency: 'monthly',
            resource: { id: 'Azym2sTkewehg121r' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-07-21T15:40:12.000Z', timestampUNIX: 1689954012 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-08-04T15:40:12.000Z', timestampUNIX: 1691163612 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
      // Orders
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            expires: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            cancelled: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 },
            lastPayment: {
              amount: 1.01,
              date: { timestamp: '2023-04-28T11:08:54.000Z', timestampUNIX: 1682680134 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      // Subscriptions
      describe('subscriptions', () => {
        describe('active', () => {
          const item = require('./payment-resolver/stripe/subscriptions/active.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'sub_1McA4ZEvB7hJrWnu1o7GMybv' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-02-16T16:12:39.000Z', timestampUNIX: 1676563959 },
            expires: { timestamp: '2024-09-15T16:12:39.000Z', timestampUNIX: 1726416759 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 6,
              date: { timestamp: '2023-08-16T16:13:11.000Z', timestampUNIX: 1692202391 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => in trial', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-in-trial.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'sub_1N1a4yEvB7hJrWnuCzx5ssWK' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-27T19:02:08.000Z', timestampUNIX: 1682622128 },
            expires: { timestamp: '2024-06-10T19:02:08.000Z', timestampUNIX: 1718046128 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-27T19:02:08.000Z', timestampUNIX: 1682622128 }
            },
            trial: {
              active: true,
              claimed: true,
              daysLeft: 13,
              expires: {
                timestamp: '2023-05-11T19:02:08.000Z',
                timestampUNIX: 1683831728,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-28T15:40:58.000Z', timestampUNIX: 1680018058 },
            expires: { timestamp: '2024-05-11T15:40:58.000Z', timestampUNIX: 1715442058 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 6,
              date: { timestamp: '2023-04-11T15:41:07.000Z', timestampUNIX: 1681227667 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => active-failed-authorization', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-active-failed-authorization.json');
          const result = Manager.SubscriptionResolver(profileSubscriptionFailedAuthorization, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'active',
            frequency: 'monthly',
            resource: { id: 'sub_1OAJjOHGybgi7uQGicdK4TGm' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-11-08T21:56:14.000Z', timestampUNIX: 1699480574 },
            expires: { timestamp: '2024-12-22T21:56:14.000Z', timestampUNIX: 1734904574 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 8,
              date: { timestamp: '2023-11-22T21:56:26.000Z', timestampUNIX: 1700690186 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => cancelled', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-cancelled.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: 'sub_1Mv9VtCzY9baOpL0I2MRKfoj' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-10T01:27:21.000Z', timestampUNIX: 1681090041 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-04-17T07:13:15.000Z', timestampUNIX: 1681715595 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-10T01:27:21.000Z', timestampUNIX: 1681090041 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('trial => refund', () => {
          const item = require('./payment-resolver/stripe/subscriptions/trial-to-refund.json');
          const result = Manager.SubscriptionResolver({}, item).resolve(options);
          const expected = {
            processor: 'stripe',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'annually',
            resource: { id: 'sub_1NWA2ZHGybgi7uQGF7ODZNEZ' },
            payment: {
              completed: true,
              refunded: true,
            },
            start: { timestamp: '2023-07-21T03:30:03.000Z', timestampUNIX: 1689910203 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '2023-08-03T19:51:57.000Z', timestampUNIX: 1691092317 },
            lastPayment: {
              amount: 72,
              date: { timestamp: '2023-07-21T03:30:03.000Z', timestampUNIX: 1689910203 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-03-30T16:52:40.000Z', timestampUNIX: 1680195160 },
            expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
            lastPayment: {
              amount: 0,
              date: { timestamp: '2023-04-13T16:52:51.000Z', timestampUNIX: 1681404771 }
            },
            trial: {
              active: false,
              claimed: true,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        // describe('unsure', () => {
        //   const item = require('./payment-resolver/stripe/subscriptions/unsure.json');
        //   const result = Manager.SubscriptionResolver({}, item).resolve(options);
        //   const expected = {
        //     processor: 'stripe',
        //     type: 'subscription',
        //     status: 'active',
        //     frequency: 'monthly',
        //     resource: { id: 'sub_1OkWCdHGybgi7uQGxQDhAQ51' },
        //     payment: {
        //       completed: true,
        //       refunded: false,
        //     },
        //     start: { timestamp: '2024-02-16T18:32:03.000Z', timestampUNIX: 1708108323 },
        //     expires: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
        //     cancelled: { timestamp: '1970-01-01T00:00:00.000Z', timestampUNIX: 0 },
        //     lastPayment: {
        //       amount: 0,
        //       date: { timestamp: '2023-04-13T16:52:51.000Z', timestampUNIX: 1681404771 }
        //     },
        //     trial: {
        //       active: false,
        //       claimed: true,
        //       daysLeft: 0,
        //       expires: {
        //         timestamp: '1970-01-01T00:00:00.000Z',
        //         timestampUNIX: 0,
        //       },
        //     },
        //     details: {
        //       message: '[REDACTED]',
        //     },
        //   }

        //   log('result', result);

        //   it('should resolve correctly', () => {
        //     return assert.deepStrictEqual(result, expected);
        //   });
        // });


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
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            expires: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            cancelled: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            lastPayment: {
              amount: 16,
              date: { timestamp: '2023-04-26T10:06:55.000Z', timestampUNIX: 1682503615 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });
      });

      describe('subscription', () => {
        describe('cancelled', () => {
          const item = require('./payment-resolver/coinbase/subscriptions/cancelled.json');
          const result = Manager.SubscriptionResolver(profileSubscriptionDefault, item).resolve(options);
          const expected = {
            processor: 'coinbase',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: '8f783fa6-eaa3-4460-af64-cac26b183ed1' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            expires: { timestamp: '2023-05-26T09:59:19.000Z', timestampUNIX: 1685095159 },
            cancelled: { timestamp: '2023-04-26T09:59:19.000Z', timestampUNIX: 1682503159 },
            lastPayment: {
              amount: 16,
              date: { timestamp: '2023-04-26T10:06:55.000Z', timestampUNIX: 1682503615 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
          }

          log('result', result);

          it('should resolve correctly', () => {
            return assert.deepStrictEqual(result, expected);
          });
        });

        describe('paid 2', () => {
          const item = require('./payment-resolver/coinbase/subscriptions/paid-2.json');
          const result = Manager.SubscriptionResolver(profileSubscriptionDefault, item).resolve(options);
          const expected = {
            processor: 'coinbase',
            type: 'subscription',
            status: 'cancelled',
            frequency: 'monthly',
            resource: { id: '1baa71fb-318c-400c-9020-08b894a1fa6e' },
            payment: {
              completed: true,
              refunded: false,
            },
            start: { timestamp: '2024-01-23T21:59:03.000Z', timestampUNIX: 1706047143 },
            expires: { timestamp: '2024-02-23T21:59:03.000Z', timestampUNIX: 1708725543 },
            cancelled: { timestamp: '2024-01-23T21:59:03.000Z', timestampUNIX: 1706047143 },
            lastPayment: {
              amount: 10,
              date: { timestamp: '2024-01-23T22:40:35.000Z', timestampUNIX: 1706049635 }
            },
            trial: {
              active: false,
              claimed: false,
              daysLeft: 0,
              expires: {
                timestamp: '1970-01-01T00:00:00.000Z',
                timestampUNIX: 0,
              },
            },
            details: {
              message: '[REDACTED]',
            },
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
