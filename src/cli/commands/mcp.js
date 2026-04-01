const path = require('path');
const BaseCommand = require('./base-command');

class McpCommand extends BaseCommand {
  async execute() {
    const self = this;
    const functionsDir = path.join(self.firebaseProjectPath, 'functions');

    // Load .env from functions directory so BACKEND_MANAGER_KEY is available
    const jetpack = require('fs-jetpack');
    const envPath = path.join(functionsDir, '.env');
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath });
    }

    // Resolve the BEM server URL
    const baseUrl = self.argv.url
      || process.env.BEM_URL
      || 'http://localhost:5002';

    // Resolve the admin key
    const backendManagerKey = self.argv.key
      || process.env.BACKEND_MANAGER_KEY
      || '';

    const { startServer } = require('../../mcp/index.js');

    await startServer({ baseUrl, backendManagerKey });
  }
}

module.exports = McpCommand;
