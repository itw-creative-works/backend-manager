const BaseCommand = require('./base-command');
const chalk = require('chalk').default;
const { confirm } = require('@inquirer/prompts');
const { initFirebase } = require('./firebase-init');

class AuthCommand extends BaseCommand {
  async execute() {
    const argv = this.main.argv;
    const args = argv._ || [];
    const subcommand = args[0]; // e.g., 'auth:get' or 'auth:set-claims'
    const action = subcommand.split(':').slice(1).join(':'); // handles 'auth:set-claims'

    // Initialize Firebase
    const isEmulator = argv.emulator || false;
    let firebase;

    try {
      firebase = initFirebase({
        firebaseProjectPath: this.firebaseProjectPath,
        emulator: isEmulator,
      });
    } catch (error) {
      this.logError(`Firebase init failed: ${error.message}`);
      return;
    }

    const { admin, projectId } = firebase;
    const target = isEmulator ? 'emulator' : 'production';
    this.log(chalk.gray(`  Target: ${projectId} (${target})\n`));

    // Dispatch to subcommand handler
    switch (action) {
      case 'get':
        return await this.get(admin, args, argv);
      case 'list':
        return await this.list(admin, args, argv);
      case 'delete':
        return await this.del(admin, args, argv, isEmulator);
      case 'set-claims':
        return await this.setClaims(admin, args, argv);
      default:
        this.logError(`Unknown auth subcommand: ${action}`);
        this.log(chalk.gray('  Available: auth:get, auth:list, auth:delete, auth:set-claims'));
    }
  }

  /**
   * Resolve a user identifier to a UserRecord.
   * Accepts UID or email address (auto-detected via @).
   */
  async resolveUser(admin, identifier) {
    if (!identifier) {
      return null;
    }

    // If it contains '@', treat as email
    if (identifier.includes('@')) {
      return await admin.auth().getUserByEmail(identifier);
    }

    return await admin.auth().getUser(identifier);
  }

  /**
   * Get a user by UID or email.
   * Usage: npx bm auth:get user@email.com
   *        npx bm auth:get abc123uid
   */
  async get(admin, args, argv) {
    const identifier = args[1];

    if (!identifier) {
      this.logError('Usage: npx bm auth:get <uid-or-email>');
      return;
    }

    try {
      const user = await this.resolveUser(admin, identifier);
      this.output(user.toJSON(), argv);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        this.logWarning(`User not found: ${identifier}`);
        return;
      }
      this.logError(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * List users.
   * Usage: npx bm auth:list [--limit 100] [--page-token TOKEN]
   */
  async list(admin, args, argv) {
    const limit = parseInt(argv.limit, 10) || 100;
    const pageToken = argv['page-token'] || argv.pageToken || undefined;

    try {
      const result = await admin.auth().listUsers(limit, pageToken);

      const users = result.users.map(user => ({
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        disabled: user.disabled,
        createdAt: user.metadata.creationTime,
        lastSignIn: user.metadata.lastSignInTime,
        customClaims: user.customClaims || {},
      }));

      this.log(chalk.gray(`  Found ${users.length} user(s)\n`));

      if (result.pageToken) {
        this.log(chalk.gray(`  Next page: --page-token ${result.pageToken}\n`));
      }

      this.output(users, argv);
    } catch (error) {
      this.logError(`Failed to list users: ${error.message}`);
    }
  }

  /**
   * Delete a user.
   * Usage: npx bm auth:delete user@email.com [--force]
   */
  async del(admin, args, argv, isEmulator) {
    const identifier = args[1];

    if (!identifier) {
      this.logError('Usage: npx bm auth:delete <uid-or-email> [--force]');
      return;
    }

    // Resolve user first to show who we're deleting
    let user;
    try {
      user = await this.resolveUser(admin, identifier);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        this.logWarning(`User not found: ${identifier}`);
        return;
      }
      this.logError(`Failed to resolve user: ${error.message}`);
      return;
    }

    this.log(chalk.gray(`  User: ${user.uid} (${user.email || 'no email'})`));

    // Require confirmation for production (skip for emulator or --force)
    if (!isEmulator && !argv.force) {
      const confirmed = await confirm({
        message: `Delete user "${user.uid}" (${user.email || 'no email'}) from PRODUCTION?`,
        default: false,
      });

      if (!confirmed) {
        this.log(chalk.gray('  Aborted.'));
        return;
      }
    }

    try {
      await admin.auth().deleteUser(user.uid);
      this.logSuccess(`User deleted: ${user.uid}`);
    } catch (error) {
      this.logError(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Set custom claims on a user.
   * Usage: npx bm auth:set-claims user@email.com '{"admin": true}'
   */
  async setClaims(admin, args, argv) {
    const identifier = args[1];
    const jsonString = args[2];

    if (!identifier || !jsonString) {
      this.logError('Usage: npx bm auth:set-claims <uid-or-email> \'<json>\'');
      return;
    }

    let claims;
    try {
      claims = JSON.parse(jsonString);
    } catch (error) {
      this.logError(`Invalid JSON: ${error.message}`);
      return;
    }

    let user;
    try {
      user = await this.resolveUser(admin, identifier);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        this.logWarning(`User not found: ${identifier}`);
        return;
      }
      this.logError(`Failed to resolve user: ${error.message}`);
      return;
    }

    try {
      await admin.auth().setCustomUserClaims(user.uid, claims);
      this.logSuccess(`Custom claims set for ${user.uid}:`);
      this.output(claims, argv);
    } catch (error) {
      this.logError(`Failed to set claims: ${error.message}`);
    }
  }

  /**
   * Output data as JSON.
   */
  output(data, argv) {
    if (argv.raw) {
      this.log(JSON.stringify(data));
    } else {
      this.log(JSON.stringify(data, null, 2));
    }
  }
}

module.exports = AuthCommand;
