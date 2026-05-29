module.exports = ({ user }) => ({
  uid: {
    types: ['string'],
    default: user?.auth?.uid,
    required: false,
  },
  attribution: {
    types: ['object'],
    default: {},
    required: false,
  },
  context: {
    types: ['object'],
    default: {},
    required: false,
  },
  // Consent decision captured at signup. Each sub-object is OPTIONAL — if the client omits
  // `legal`/`marketing` (e.g. a legacy account re-firing /user/signup on page load with no
  // fresh consent), the route leaves that consent untouched rather than downgrading it.
  // When present, `granted` is the decision and `text` is the exact copy shown to the user.
  consent: {
    legal: {
      granted: { types: ['boolean'], required: false },
      text: { types: ['string'], required: false },
    },
    marketing: {
      granted: { types: ['boolean'], required: false },
      text: { types: ['string'], required: false },
    },
  },
});
