// trial-in-trial
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

// trial-to-active
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

// trial-to-cancelled
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

// trial-to-active-to-cancelled
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

// payment regular
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
