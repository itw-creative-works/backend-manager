const _ = require('lodash');
const powertools = require('node-powertools');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Perform checks
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    // Run queries
    self.docs = [];
    assistant.log('Queries', payload.data.payload.queries);
    let queries = powertools.arrayify(payload.data.payload.queries || []);

    let promises = [];
    for (var i = 0; i < queries.length; i++) {
      queries[i]
      promises.push(self.runQuery(queries[i]))
    }

    // Get the results
    await Promise.all(promises)
      .then((r) => {
        return resolve({data: self.docs});
      })
      .catch((e) => {
        return reject(assistant.errorify(e, {code: 500, sentry: false, send: false, log: false}).error)
      })

  });

};

Module.prototype.runQuery = function (query) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  query = query || {};
  query.where = powertools.arrayify(query.where || []);
  query.filter = powertools.arrayify(query.filter || []);
  query.orderBy = powertools.arrayify(query.orderBy || []);

  // self.assistant.log('Query', query);

  return new Promise(function(resolve, reject) {
    let collection;

    if (!query.collection) {
      return resolve([]);
      // return reject(new Error('No collection specified.'));
    }

    collection = self.libraries.admin.firestore().collection(query.collection);

    for (var i = 0; i < query.where.length; i++) {
      let cur = query.where[i];
      collection = collection.where(cur.field, cur.operator, cur.value);
    }
    for (var i = 0; i < query.orderBy.length; i++) {
      let cur = query.orderBy[i];
      collection = collection.orderBy(cur.field, cur.order)
    }
    if (query.limit) {
      collection = collection.limit(query.limit)
    }
    if (query.startAt) {
      collection = collection.startAt(query.startAt)
    }
    if (query.startAfter) {
      collection = collection.startAfter(query.startAfter)
    }
    if (query.endAt) {
      collection = collection.endAt(query.endAt)
    }
    if (query.endBefore) {
      collection = collection.endBefore(query.endBefore)
    }

    collection
    .get()
    .then(function (querySnapshot) {
      querySnapshot.forEach(function (doc) {

        let exists = self.docs.find(item => {
          return item.path === doc.ref.path
        })

        if (!exists && checkFilter(doc.data(), query.filter)) {
          self.docs.push({
            path: doc.ref.path,
            data: doc.data(),
          });
        }

      });

      if (query.filterIndex) {
        let iS = query.filterIndex[0];
        let iF = query.filterIndex[1];
        iF = iF > self.docs.length ? self.docs.length - 1 : iF;
        self.docs = self.docs.slice(iS, iF);
      }

      return resolve(self.docs);
    })
    .catch(function (error) {
      self.assistant.error(error)
      return reject(error);
    });
  });


};

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

module.exports = Module;
