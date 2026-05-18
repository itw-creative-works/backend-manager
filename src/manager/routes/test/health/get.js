const path = require('path');
const { readTestMode, applyEnvFromFile } = require('../../../../test/utils/test-mode-file.js');

module.exports = async ({ assistant, Manager }) => {

  // Belt-and-suspenders freshness check: re-read the test-mode file before
  // reporting `testExtendedMode`. fs.watch installed in Manager.init usually
  // catches changes within ~50ms, but this handler hits the disk directly to
  // guarantee the runner sees the actual current value even if the watcher
  // missed an event. ~1ms cost on a debug endpoint.
  try {
    const projectDir = path.dirname(Manager.cwd);
    const data = readTestMode(projectDir);
    applyEnvFromFile(data);
  } catch (e) {
    // Non-fatal — if the file can't be read, fall through to whatever
    // process.env already has.
  }

  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: assistant.meta?.environment || 'unknown',
    version: Manager.package?.version || 'unknown',
    bemVersion: Manager.version || 'unknown',
    testExtendedMode: !!process.env.TEST_EXTENDED_MODE,
  };

  assistant.log('Health check', response);

  return assistant.respond(response);
};
