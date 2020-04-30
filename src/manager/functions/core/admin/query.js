let _;
let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant({req: data.req, res: data.res})

    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let libraries = this.libraries;
    let assistant = this.assistant;
    let self = this;

    return libraries.cors(req, res, async () => {
      let response = {
        status: 200,
      };

      // authenticate admin!
      let user = await assistant.authorize();
      if (!user.roles.admin) {
        response.status = 500;
        response.error = 'Unauthenticated, admin required.';
      } else {
        self.docs = [];
        assistant.log('queries', assistant.request.data.queries);
        let queries = arrayify(assistant.request.data.queries || []);

        let promises = [];
        for (var i = 0; i < queries.length; i++) {
          queries[i]
          promises.push(self.runQuery(queries[i]))
        }
        await Promise.all(promises)
        .then(function () {
          console.log('ALL', self.docs);
        })
      }

      assistant.log(assistant.request.data, response);
      // return 'break';
      return res.status(response.status).json(self.docs);
    });
  },
  runQuery: runQuery,
}
module.exports = Module;

// HELPERS //
async function runQuery(payload) {
  let self = this;

  payload = payload || {};
  payload.where = arrayify(payload.where || []);
  payload.filter = arrayify(payload.filter || []);

  // payload.limit = payload.limit || false;
  // payload.orderBy = payload.orderBy || false;
  // payload.orderBy = payload.orderBy || false;

  return new Promise(function(resolve, reject) {
    var collection = self.libraries.admin.firestore().collection(payload.collection);
    for (var i = 0; i < payload.where.length; i++) {
      let cur = payload.where[i];
      collection = collection.where(cur.field, cur.operator, cur.value);
    }
    if (payload.limit) {
      collection = collection.limit(payload.limit)
    }
    if (payload.orderBy) {
      collection = collection.orderBy(payload.orderBy)
    }
    if (payload.startAt) {
      collection = collection.orderBy(payload.startAt)
    }
    if (payload.endAt) {
      collection = collection.orderBy(payload.endAt)
    }

    collection
    .get()
    .then(function (querySnapshot) {
      querySnapshot.forEach(function (doc) {

        if (checkFilter(doc.data(), payload.filter)) {
          self.docs.push(doc.data());
        }

      });

      if (payload.filterIndex) {
        let iS = payload.filterIndex[0];
        let iF = payload.filterIndex[1];
        iF = iF > self.docs.length ? self.docs.length - 1 : iF;
        self.docs = self.docs.slice(iS, iF);
      }

      resolve();
    })
    .catch(function (error) {
      console.log("ERROR", error);
      reject(error);
    });
  });

}

function checkFilter(data, filter) {
  _ = _ || require('lodash');
  if (filter.length > 0) {
    for (var i = 0; i < filter.length; i++) {
      let field = filter[i].field;
      let regex = filter[i].regex;
      let flags = filter[i].flags || '';
      let value = _.get(data, field, undefined);
      // let value = data[field]
      regex = new RegExp(regex, flags);
      // console.log('CHECKING', filter[i], data);
      // console.log(regex)
      // console.log(value.match(regex))
      if (value.match(regex)) {
        return true
      } else {
        return false;
      }
    }
  } else {
    return true;
  }

}

function arrayify(input) {
  if (!Array.isArray(input)) {
    return [input];
  } else {
    return input;
  }
}
