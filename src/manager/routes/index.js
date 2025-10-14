function Route() {
  const self = this;

  return self;
}

Route.prototype.main = async function (assistant) {
  const self = this;

  // Shortcuts
  const Manager = assistant.Manager;
  const usage = assistant.usage;
  const user = assistant.usage.user;
  const analytics = assistant.analytics;
  const settings = assistant.settings;

  // Get url
  const url = Manager.config?.brand?.url;

  // Log
  assistant.log(`Route.main(): Executing route logic`, url);

  // Redirect to Google
  assistant.redirect(url);
};

module.exports = Route;
