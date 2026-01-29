const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const chalk = require('chalk');

/**
 * Ensures projectId is consistent across all configuration files:
 * - .firebaserc (projects.default)
 * - functions/backend-manager-config.json (firebaseConfig.projectId)
 * - functions/service-account.json (project_id)
 *
 * Mismatches cause tests to fail when running emulators in separate terminals
 * because different parts of the system connect to different Firestore databases.
 */
class ProjectIdConsistencyTest extends BaseTest {
  getName() {
    return 'project IDs are consistent across all config files';
  }

  async run() {
    const sources = this.getProjectIdSources();

    // Check if we have at least .firebaserc (the source of truth)
    if (!sources.firebaserc.exists) {
      console.error(chalk.red('Missing .firebaserc file'));
      return false;
    }

    if (!sources.firebaserc.projectId) {
      console.error(chalk.red('Missing projects.default in .firebaserc'));
      return false;
    }

    const expectedProjectId = sources.firebaserc.projectId;
    const mismatches = [];

    // Check backend-manager-config.json
    if (sources.bemConfig.exists) {
      if (!sources.bemConfig.projectId) {
        mismatches.push({
          file: 'backend-manager-config.json',
          field: 'firebaseConfig.projectId',
          expected: expectedProjectId,
          actual: '(missing)',
        });
      } else if (sources.bemConfig.projectId !== expectedProjectId) {
        mismatches.push({
          file: 'backend-manager-config.json',
          field: 'firebaseConfig.projectId',
          expected: expectedProjectId,
          actual: sources.bemConfig.projectId,
        });
      }
    }

    // Check service-account.json
    if (sources.serviceAccount.exists) {
      if (!sources.serviceAccount.projectId) {
        mismatches.push({
          file: 'service-account.json',
          field: 'project_id',
          expected: expectedProjectId,
          actual: '(missing)',
        });
      } else if (sources.serviceAccount.projectId !== expectedProjectId) {
        mismatches.push({
          file: 'service-account.json',
          field: 'project_id',
          expected: expectedProjectId,
          actual: sources.serviceAccount.projectId,
        });
      }
    }

    if (mismatches.length > 0) {
      console.error(chalk.red('\nProject ID mismatches detected:'));
      console.error(chalk.gray(`  Source of truth: .firebaserc → ${expectedProjectId}\n`));

      for (const mismatch of mismatches) {
        console.error(chalk.red(`  ${mismatch.file} (${mismatch.field})`));
        console.error(chalk.gray(`    Expected: ${mismatch.expected}`));
        console.error(chalk.gray(`    Actual:   ${mismatch.actual}\n`));
      }

      return false;
    }

    return true;
  }

  getProjectIdSources() {
    const projectPath = this.self.firebaseProjectPath;

    // .firebaserc
    const firebasercPath = `${projectPath}/.firebaserc`;
    const firebasercContent = jetpack.read(firebasercPath);
    const firebasercData = firebasercContent ? JSON5.parse(firebasercContent) : null;

    // backend-manager-config.json
    const bemConfigPath = `${projectPath}/functions/backend-manager-config.json`;
    const bemConfigContent = jetpack.read(bemConfigPath);
    const bemConfigData = bemConfigContent ? JSON5.parse(bemConfigContent) : null;

    // service-account.json
    const serviceAccountPath = `${projectPath}/functions/service-account.json`;
    const serviceAccountContent = jetpack.read(serviceAccountPath);
    const serviceAccountData = serviceAccountContent ? JSON5.parse(serviceAccountContent) : null;

    return {
      firebaserc: {
        exists: !!firebasercContent,
        projectId: firebasercData?.projects?.default || null,
      },
      bemConfig: {
        exists: !!bemConfigContent,
        projectId: bemConfigData?.firebaseConfig?.projectId || null,
      },
      serviceAccount: {
        exists: !!serviceAccountContent,
        projectId: serviceAccountData?.project_id || null,
      },
    };
  }

  async fix() {
    const sources = this.getProjectIdSources();

    if (!sources.firebaserc.projectId) {
      console.log(chalk.red('Cannot fix: .firebaserc is missing or has no projects.default'));
      console.log(chalk.yellow('Run: firebase use --add'));
      throw new Error('Missing .firebaserc configuration');
    }

    const expectedProjectId = sources.firebaserc.projectId;

    // Fix backend-manager-config.json
    if (sources.bemConfig.exists && sources.bemConfig.projectId !== expectedProjectId) {
      const bemConfigPath = `${this.self.firebaseProjectPath}/functions/backend-manager-config.json`;
      const bemConfigContent = jetpack.read(bemConfigPath);
      const bemConfigData = JSON5.parse(bemConfigContent);

      bemConfigData.firebaseConfig = bemConfigData.firebaseConfig || {};
      bemConfigData.firebaseConfig.projectId = expectedProjectId;

      jetpack.write(bemConfigPath, JSON.stringify(bemConfigData, null, 2));
      console.log(chalk.green(`Fixed: backend-manager-config.json → firebaseConfig.projectId = ${expectedProjectId}`));
    }

    // Cannot auto-fix service-account.json - must download correct one from Firebase Console
    if (sources.serviceAccount.exists && sources.serviceAccount.projectId !== expectedProjectId) {
      console.log(chalk.red(`\nCannot auto-fix service-account.json`));
      console.log(chalk.yellow(`  Current project_id: ${sources.serviceAccount.projectId}`));
      console.log(chalk.yellow(`  Expected project_id: ${expectedProjectId}`));
      console.log(chalk.yellow(`\n  Download the correct service account from:`));
      console.log(chalk.cyan(`  https://console.firebase.google.com/project/${expectedProjectId}/settings/serviceaccounts/adminsdk`));
      throw new Error('service-account.json has wrong project_id - download correct one from Firebase Console');
    }
  }
}

module.exports = ProjectIdConsistencyTest;