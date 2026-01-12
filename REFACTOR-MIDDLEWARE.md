MIDDLEWARE REFACTOR
We have a system where we handle incoming requests using a route/schema system found here:
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/assistant.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/middleware.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/settings.js

You can see an example of it in our consuming project:
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/index.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/routes/example/index.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/schemas/example/index.js

I have some ideas iw as thinking about and id like to know your thoughts:
* new design so that each route is modern JS that does a single export instead of exportting a class with an init() and a main() method.
* schema system currently uses the user's plan when designing the schma like
module.exports = function (assistant) {
  return {
    // DEFAULTS
    ['defaults']: {
      key: {
        types: ['string'],
        value: undefined,
        default: '',
        required: false,
        min: 0,
        max: 2048,
      },
    },

    // Premium plan
    ['premium']: {
      key: {
        types: ['string'],
        value: undefined,
        default: 'premium-default',
        required: false,
        min: 0,
        max: 4096,
      },
    }
  };
}

however it hink we should instead eliminate the toplevel plan/default system and code each plan changes into the individual keys like:
  const schema = {
    id: {
      types: ['string'],
      value: () => assistant.Manager.Utilities().randomId(),
      required: false,
    },
    feature: {
      types: ['string'],
      default: '',
      required: true,
      min: 1,
      max: 4,
    },
  };

  // Adjust schema based on plan
  if (assistant.user.plan === 'premium') {
    schema.feature.max = 8;
  }
