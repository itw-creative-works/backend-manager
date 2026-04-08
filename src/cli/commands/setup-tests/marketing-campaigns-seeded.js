const BaseTest = require('./base-test');
const chalk = require('chalk').default;
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

      // Check enforced fields + missing defaults
      const data = doc.data();

      for (const [path, expected] of Object.entries(seed.enforced)) {
        const actual = _.get(data, path);

        if (!_.isEqual(actual, expected)) {
          return false;
        }
      }

      // Check for missing fields that should exist from seed
      if (hasMissingFields(data, seed.doc)) {
        return false;
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

      // Doc exists → fill missing defaults + enforce required fields
      const data = doc.data();
      const updates = {};

      // Fill missing fields from seed defaults (never overwrite existing values)
      fillMissing(data, seed.doc, updates, '');

      // Enforce required fields (always overwrite to match seed)
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

/**
 * Check if the live doc is missing any fields defined in the seed.
 */
function hasMissingFields(live, seed, prefix) {
  for (const [key, seedValue] of Object.entries(seed)) {
    if (key === 'metadata') {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const liveValue = _.get(live, path);

    if (liveValue === undefined) {
      return true;
    }

    if (_.isPlainObject(seedValue) && _.isPlainObject(liveValue)) {
      if (hasMissingFields(live, seedValue, path)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively fill missing fields from seed into updates.
 * Only sets fields that don't exist in the live doc — never overwrites.
 * Skips metadata (managed separately).
 */
function fillMissing(live, seed, updates, prefix) {
  for (const [key, seedValue] of Object.entries(seed)) {
    if (key === 'metadata') {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const liveValue = _.get(live, path);

    // If live doc is missing this field entirely, set it from seed
    if (liveValue === undefined) {
      _.set(updates, path, seedValue);
      console.log(chalk.blue(`  + ${path}: ${chalk.dim('(missing)')} → ${chalk.bold(JSON.stringify(seedValue).slice(0, 80))}`));
      continue;
    }

    // If both are plain objects, recurse to check nested fields
    if (_.isPlainObject(seedValue) && _.isPlainObject(liveValue)) {
      fillMissing(live, seedValue, updates, path);
    }
  }
}

module.exports = MarketingCampaignsSeededTest;
