/**
 * Settings
 *
 */
function Settings(m) {
  const self = this;

  self.Manager = m;

  self.user = null;

  self.initialized = false;
}

Settings.prototype.resolve = function (assistant, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;

    // Set options
    options = options || {};

    // Set initialized to true
    self.initialized = true;

    // Resolve
    return resolve(self);
  });
};

module.exports = Settings;
