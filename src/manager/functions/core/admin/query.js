const _ = require('lodash');
const powertools = require('node-powertools');

let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant({req: data.req, res: data.res})
    this.req = data.req;
    this.res = data.res;

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;

    return libraries.cors(req, res, async () => {
      let response = {
        status: 200,
        data: {},
        error: null,
      };

      // authenticate admin!
      let user = await assistant.authenticate();

      // Analytics
      let analytics = new self.Manager.Analytics({
        uuid: user.auth.uid,
      })
      .event({
        category: 'admin',
        action: 'query',
        // label: '',
      });

      if (!user.roles.admin) {
        response.status = 401;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, {environment: 'production'})
      } else {
        self.docs = [];
        // assistant.log('Queries', assistant.request.data.queries);
        let queries = powertools.arrayify(assistant.request.data.queries || []);

        let promises = [];
        for (var i = 0; i < queries.length; i++) {
          queries[i]
          promises.push(self.runQuery(queries[i]))
        }

        await Promise.all(promises)
          .then((r) => {
            response.data = self.docs;
            // assistant.log('Query result:', );
          })
          .catch((e) => {
            response.error = e;
            response.status = 400;
            assistant.error(response.error, {environment: 'production'})
          })

      }

      // assistant.log(assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
  runQuery: runQuery,
}
module.exports = Module;

// HELPERS //
async function runQuery(payload) {
  let self = this;

  payload = payload || {};
  payload.where = powertools.arrayify(payload.where || []);
  payload.filter = powertools.arrayify(payload.filter || []);
  payload.orderBy = powertools.arrayify(payload.orderBy || []);

  // self.assistant.log('Query', payload);

  return new Promise(function(resolve, reject) {
    let collection;

    if (!payload.collection) {
      return resolve([]);
      // return reject(new Error('No collection specified.'));
    }

    collection = self.libraries.admin.firestore().collection(payload.collection);

    for (var i = 0; i < payload.where.length; i++) {
      let cur = payload.where[i];
      collection = collection.where(cur.field, cur.operator, cur.value);
    }
    for (var i = 0; i < payload.orderBy.length; i++) {
      let cur = payload.orderBy[i];
      collection = collection.orderBy(cur.field, cur.order)
    }
    if (payload.limit) {
      collection = collection.limit(payload.limit)
    }
    if (payload.startAt) {
      collection = collection.startAt(payload.startAt)
    }
    if (payload.startAfter) {
      collection = collection.startAfter(payload.startAfter)
    }
    if (payload.endAt) {
      collection = collection.endAt(payload.endAt)
    }
    if (payload.endBefore) {
      collection = collection.endBefore(payload.endBefore)
    }

    collection
    .get()
    .then(function (querySnapshot) {
      querySnapshot.forEach(function (doc) {

        let exists = self.docs.find(item => {
          return item.path === doc.ref.path
        })

        if (!exists && checkFilter(doc.data(), payload.filter)) {
          self.docs.push({
            path: doc.ref.path,
            data: doc.data(),
          });
        }

      });

      if (payload.filterIndex) {
        let iS = payload.filterIndex[0];
        let iF = payload.filterIndex[1];
        iF = iF > self.docs.length ? self.docs.length - 1 : iF;
        self.docs = self.docs.slice(iS, iF);
      }

      return resolve(self.docs);
    })
    .catch(function (error) {
      self.assistant.error(error, {environment: 'production'})
      return reject(error);
    });
  });

}

function checkFilter(data, filter) {

  // Loop through all filters
  for (var i = 0, l = filter.length; i < l; i++) {
    // Set up field and checks
    let field = `${filter[i].field}`.split(' || ');
    field = powertools.arrayify(field);
    let matches = filter[i].matches || '';
    let regex = powertools.regexify(matches);

    // Pass/fail
    let innerPassed = false;

    // Loop through each filter's fields
    for (var i2 = 0, l2 = field.length; i2 < l2; i2++) {
      let fieldInner = field[i2];
      let value = _.get(data, fieldInner, undefined);

      if (typeof value === 'undefined') {
        innerPassed = false;
        continue;
      } else if (typeof value === 'string') {
        if (value.match(regex)) {
          innerPassed = true;
          break;
        }
      }
    }

    // If there was not a successful innerPassed then break (innerPassed works on OR logic)
    if (!innerPassed) {
      return false;
    }

  }
  return true;
}
