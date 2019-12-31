let _;
let Module = {
  init: async function (data) {
    this.ref = data.ref;
    this.req = data.req;
    this.res = data.res
    this.assistant = new this.ref.Assistant().init({
      ref: {
        req: data.req,
        res: data.res,
        admin: data.ref.admin,
        functions: data.ref.functions,
      }
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    let This = this;

    return ref.cors(req, res, async () => {
      let response = {
        status: 200,
      };

      // authenticate admin!
      let authAdmin = await assistant.authorizeAdmin();
      if (!authAdmin) {
        response.status = 500;
        response.error = 'Unauthenticated, admin required.';
      } else {
        This.docs = [];
        assistant.log('queries', assistant.request.data.queries);
        let queries = arrayify(assistant.request.data.queries || []);

        let promises = [];
        for (var i = 0; i < queries.length; i++) {
          queries[i]
          promises.push(This.runQuery(queries[i]))
        }
        await Promise.all(promises)
        .then(function () {
          console.log('ALL', This.docs);
        })
      }

      assistant.log(assistant.request.data, response);
      // return 'break';
      return res.status(response.status).json(This.docs);
    });
  },
  runQuery: runQuery,
}
module.exports = Module;

// HELPERS //
async function runQuery(payload) {
  let This = this;

  payload = payload || {};
  payload.where = arrayify(payload.where || []);
  payload.filter = arrayify(payload.filter || []);

  // payload.limit = payload.limit || false;
  // payload.orderBy = payload.orderBy || false;
  // payload.orderBy = payload.orderBy || false;

  return new Promise(function(resolve, reject) {
    var collection = This.ref.admin.firestore().collection(payload.collection);
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
          This.docs.push(doc.data());
        }

      });

      if (payload.filterIndex) {
        let iS = payload.filterIndex[0];
        let iF = payload.filterIndex[1];
        iF = iF > This.docs.length ? This.docs.length - 1 : iF;
        This.docs = This.docs.slice(iS, iF);
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
