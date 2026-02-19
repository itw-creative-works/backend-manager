module.exports = async ({ assistant, Manager }) => {

  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: assistant.meta?.environment || 'unknown',
    version: Manager.package?.version || 'unknown',
    bemVersion: Manager.version || 'unknown',
  };

  assistant.log('Health check', response);

  return assistant.respond(response);
};
