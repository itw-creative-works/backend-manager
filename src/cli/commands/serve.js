const BaseCommand = require('./base-command');
const powertools = require('node-powertools');
const WatchCommand = require('./watch');

class ServeCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const port = self.argv.port || self.argv?._?.[1] || '5000';

    // Start BEM watcher in background
    const watcher = new WatchCommand(self);
    watcher.startBackground();

    // Start Stripe webhook forwarding in background
    // Ignored because we cant really fully process them unless the emulator is running
    // this.startStripeWebhookForwarding();

    // Execute
    await powertools.execute(`firebase serve --port ${port}`, { log: true });
  }
}

module.exports = ServeCommand;
