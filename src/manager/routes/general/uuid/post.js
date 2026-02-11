const uuid = require('uuid');

module.exports = async ({ assistant, settings, analytics }) => {

  const name = settings.name || settings.input;
  const version = `${settings.version}`.replace('v', '');
  const namespace = settings.namespace;

  // Validate version
  if (version !== '4' && version !== '5') {
    return assistant.respond(`v${version} is not a valid version.`, { code: 400 });
  }

  // Validate name for v5
  if (version === '5' && !name) {
    return assistant.respond('You must provide a name to hash for UUID v5.', { code: 400 });
  }

  // Generate UUID
  const result = version === '5'
    ? uuid.v5(name, namespace)
    : uuid.v4();

  // Send analytics event
  analytics.event('general/uuid', { version });

  // Log and respond
  assistant.log('UUID Generated', { name, version, namespace, result });

  return assistant.respond({ uuid: result });
};
