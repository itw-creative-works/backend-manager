const BaseCommand = require('./base-command');

class StripeCommand extends BaseCommand {
  async execute() {
    const stripeProcess = this.startStripeWebhookForwarding();

    if (stripeProcess) {
      // Keep alive until Ctrl+C
      await new Promise(() => {});
    }
  }
}

module.exports = StripeCommand;
