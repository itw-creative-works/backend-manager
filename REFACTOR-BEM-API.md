We need to do a pretty significatn refactor of our BEM API now.

Since that was orignally implemented, I built a much better process for hading incoming http requests. That is, the route/schema system found here:
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/assistant.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/middleware.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/helpers/settings.js

You can see an example of it in our consuming project:
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/index.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/routes/example/index.js
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/functions/schemas/example/index.js

We built a single unified bem_api function that handles all http requests in a single place, and then routes them, see here:
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/index.js
.https.onRequest(async (req, res) => self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, })));

We should refactor this system to USE THE NEW ROUTE/SCHEMA SYSTEM rather than the old way of doing things. This will make it much easier to maintain and extend in the future.

We can start with a simple one like:
/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager/src/manager/functions/core/actions/api/general/generate-uuid.js

and once we perfect that we can move on to the others.

For each BEM refactor, we should create a route and a schema for the expected input. As you can see, BEM APIs epect a command and payload in the body, requiring it to be a POST operation. I would like to rebuild this system to be more proper, so that each BEM api can be GET, POST, etc as appropriate.

Previously:
request('/backend-manager', {
  method: 'POST',
  body: {
    command: 'generate-uuid',
    payload: { ... }
  }
})

but i think it owud be more intuitive if going forward we just had endpoints like:
request('/backend-manager/general:uuid', {
  method: 'POST',
  body: { ... }
})
OR
request('/backend-manager/general/uuid', {
  method: 'POST',
  body: { ... }
})

Im not sure how we can do this to be backwards compatible with existing BEM API consumers, but it does need to be backwards compatible.

If you look at the firebase.json in the consuming project we can see that
/Users/ian/Developer/Repositories/ITW-Creative-Works/ultimate-jekyll-backend/firebase.json
{
  "source": "/backend-manager",
  "function": "bm_api"
},

So maybe we could make it:
{
  "source": "/backend-manager/**",
  "function": "bm_api"
},
and then parse the route inside the bem_api function to determine which route/schema to use, falling back to the old system if the route is just /backend-manager with a "command" in the body, and then use the new route/schema system if the path is /backend-manager/something?

Either way, i think we need a minimal intermediary step where we determine which one to use based on the incoming request and then either just route to the old one or route to the new "middleware", "settings", route/schema system

I would like each new route to have a great name clearly indicating its purpose, the method should be appropriate for the action (GET for fetches, POST for creates, etc) and the schema should be well defined for each route.

Since we can build this new API system however we want, i also expect you to rewrite and refactor the BEM api endppints to be kickass, modern, and well designed.






