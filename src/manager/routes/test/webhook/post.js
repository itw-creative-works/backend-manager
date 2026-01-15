const powertools = require('node-powertools');

module.exports = async (assistant) => {
  const settings = assistant.settings;

  // Optional delay
  if (settings.delay > 0) {
    await powertools.wait(settings.delay);
  }

  // Return based on status code
  if (settings.status >= 200 && settings.status <= 299) {
    return assistant.respond(settings.response, { code: settings.status });
  }

  if (settings.status >= 400 && settings.status <= 599) {
    return assistant.respond(settings.response || 'Unknown error message provided', { code: settings.status });
  }

  // Default response
  return assistant.respond({ received: true });
};
