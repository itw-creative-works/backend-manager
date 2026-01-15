module.exports = async (assistant) => {
  const analytics = assistant.analytics;

  // Send analytics event
  analytics.event({
    name: 'test',
    params: {},
  });

  // Log
  assistant.log('Running test');
  assistant.log('assistant.request.body', assistant.request.body);
  assistant.log('assistant.request.query', assistant.request.query);
  assistant.log('assistant.request.headers', assistant.request.headers);
  assistant.log('assistant.request.data', assistant.request.data);
  assistant.log('assistant.settings', assistant.settings);

  // Return success
  return assistant.respond({timestamp: new Date().toISOString(), id: assistant.id});
};
