module.exports = async (assistant) => {
  const Manager = assistant.Manager;

  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: assistant.meta?.environment || 'unknown',
    version: Manager.package?.version || 'unknown',
  };

  assistant.log('Health check', response);

  return assistant.respond(response);
};
