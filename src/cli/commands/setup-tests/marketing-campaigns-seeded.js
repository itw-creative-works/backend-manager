const BaseTest = require('./base-test');
const chalk = require('chalk');
const _ = require('lodash');
const { buildSeedCampaigns } = require('./helpers/seed-campaigns');

class MarketingCampaignsSeededTest extends BaseTest {
  getName() {
    return 'marketing campaigns seeded in Firestore';
  }

  async run() {
    const admin = this._getAdmin();

    if (!admin) {
      return true; // Can't connect — skip gracefully
    }

    const seeds = buildSeedCampaigns();

    for (const seed of seeds) {
      const doc = await admin.firestore().doc(`marketing-campaigns/${seed.id}`).get();

      // Doc doesn't exist → fail
      if (!doc.exists) {
        return false;
      }

      // Check enforced fields
      const data = doc.data();

      for (const [path, expected] of Object.entries(seed.enforced)) {
        const actual = _.get(data, path);

        if (!_.isEqual(actual, expected)) {
          return false;
        }
      }
    }

    return true;
  }

  async fix() {
    const admin = this._getAdmin();

    if (!admin) {
      console.log(chalk.yellow('  ⚠ No Firebase connection — skipping campaign seeding'));
      console.log(chalk.yellow('    Run from a project with service-account.json to seed'));
      return;
    }

    const seeds = buildSeedCampaigns();

    for (const seed of seeds) {
      const docRef = admin.firestore().doc(`marketing-campaigns/${seed.id}`);
      const doc = await docRef.get();

      // Doc doesn't exist → create it
      if (!doc.exists) {
        await docRef.set(seed.doc);
        console.log(chalk.green(`  + Created ${chalk.cyan(seed.id)}: ${seed.doc.settings.name}`));
        continue;
      }

      // Doc exists → check and fix enforced fields
      const data = doc.data();
      const updates = {};

      for (const [path, expected] of Object.entries(seed.enforced)) {
        const actual = _.get(data, path);

        if (!_.isEqual(actual, expected)) {
          _.set(updates, path, expected);
          console.log(chalk.yellow(`  ↻ ${seed.id}: ${chalk.cyan(path)} ${chalk.dim(JSON.stringify(actual))} → ${chalk.bold(JSON.stringify(expected))}`));
        }
      }

      if (Object.keys(updates).length) {
        updates.metadata = {
          updated: {
            timestamp: new Date().toISOString(),
            timestampUNIX: Math.round(Date.now() / 1000),
          },
        };

        await docRef.set(updates, { merge: true });
      } else {
        console.log(chalk.dim(`  ✓ ${seed.id} — all enforced fields correct`));
      }
    }
  }

  _getAdmin() {
    try {
      const { initFirebase } = require('../firebase-init');
      const { admin } = initFirebase({
        firebaseProjectPath: this.self.firebaseProjectPath,
        emulator: false,
      });

      return admin;
    } catch (e) {
      console.log(chalk.dim(`  (firebase-init failed: ${e.message})`));
      return null;
    }
  }
}

module.exports = MarketingCampaignsSeededTest;
