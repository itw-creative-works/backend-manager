const jetpack = require('fs-jetpack');
const JSON5 = require('json5');

function loadJSON(path) {
  const contents = jetpack.read(path);
  if (!contents) {
    return {};
  }
  return JSON5.parse(contents);
}

function saveJSON5(filePath, data) {
  jetpack.write(filePath, JSON5.stringify(data, null, 2) + '\n');
}

function hasContent(object) {
  return Object.keys(object).length > 0;
}

function isLocal(name) {
  return name && name.indexOf('file:') > -1;
}

module.exports = {
  loadJSON,
  saveJSON5,
  hasContent,
  isLocal,
};
