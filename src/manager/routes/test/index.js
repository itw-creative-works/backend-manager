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

  // Load preloaded libraries
  // ..

  // Send analytics event
  analytics.event({
    name: 'test',
    params: {},
  });

  // Check for user authentication
  // if (!user.roles.admin) {
  //   return assistant.respond(`Admin required`, {code: 401});;
  // }

  // Log
  assistant.log('Running test');
  assistant.log('assistant.request.body', assistant.request.body);
  assistant.log('assistant.request.query', assistant.request.query);
  assistant.log('assistant.request.headers', assistant.request.headers);
  assistant.log('assistant.request.data', assistant.request.data);
  assistant.log('assistant.settings', assistant.settings);

  // Return success
  assistant.respond({timestamp: new Date().toISOString(), id: assistant.id});
};

module.exports = Route;
