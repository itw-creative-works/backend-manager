module.exports = function(ref, req, res, options) {
  console.log('Called BackendManager/webhookTest.js INNER INNER');
  return ref.cors(req, res, async () => {
    let response = Object.assign(req.body, req.query);
    return res.status(200).json({status: 200, request: response});
  });
};
