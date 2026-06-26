const BaseCommand = require('./base-command');
const chalk = require('chalk').default;
const powertools = require('node-powertools');
const attachLogFile = require('../utils/attach-log-file');
const { execSync } = require('child_process');
const path = require('path');
const jetpack = require('fs-jetpack');

const DEFAULT_REGION = 'us-central1';
const PUBLIC_HTTP_FUNCTIONS = [
  'bm_api',
  'bm_authBeforeCreate',
  'bm_authBeforeSignIn',
];

class DeployCommand extends BaseCommand {
  async execute() {
    const self = this.main;

    // Quick check that not using local packages
    const allDeps = JSON.stringify(self.packageJSON.dependencies || {}) + JSON.stringify(self.packageJSON.devDependencies || {});
    if (allDeps.includes('file:')) {
      this.logError(`Please remove local packages before deploying!`);
      return;
    }

    const logPath = this.getLogsPath('deploy.log');
    attachLogFile(logPath);
    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    try {
      await powertools.execute('firebase deploy', {
        log: false,
        config: {
          cwd: self.firebaseProjectPath,
          stdio: ['inherit', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '1' },
        },
      }, (child) => {
        child.stdout.on('data', (data) => process.stdout.write(data));
        child.stderr.on('data', (data) => process.stderr.write(data));
      });

      // After successful deploy, ensure HTTP functions are publicly invocable
      await this.ensurePublicInvoker();
    } finally {
      await attachLogFile.detach();
    }
  }

  /**
   * Ensure HTTP-triggered functions have allUsers as cloudfunctions.invoker.
   *
   * Firebase CLI used to set this automatically but stopped around the Node 10
   * runtime transition. Without it, HTTP requests get a 403 at the IAM level
   * before BEM's application-level auth (backendManagerKey) can run.
   */
  async ensurePublicInvoker() {
    const projectId = this.getProjectId();

    if (!projectId) {
      return;
    }

    const gcloud = this.findGcloud();

    if (!gcloud) {
      this.log(chalk.gray('\n  Skipping public invoker check (gcloud not found)\n'));
      return;
    }

    this.log(chalk.gray('\n  Ensuring HTTP functions are publicly invocable...\n'));

    let fixed = 0;
    let ok = 0;

    for (const fnName of PUBLIC_HTTP_FUNCTIONS) {
      try {
        // Check current IAM policy
        const policyOutput = execSync(
          `${gcloud} functions get-iam-policy ${fnName} --project ${projectId} --region ${DEFAULT_REGION} --format=json`,
          { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
        );

        const policy = JSON.parse(policyOutput);
        const hasAllUsers = (policy.bindings || []).some(
          (b) => b.role === 'roles/cloudfunctions.invoker'
            && (b.members || []).includes('allUsers'),
        );

        if (hasAllUsers) {
          ok++;
          continue;
        }

        // Add allUsers as invoker
        execSync(
          `${gcloud} functions add-iam-policy-binding ${fnName} --project ${projectId} --region ${DEFAULT_REGION} --member="allUsers" --role="roles/cloudfunctions.invoker"`,
          { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] },
        );

        this.log(`  ${chalk.green('✓')} Set public invoker on ${chalk.cyan(fnName)}`);
        fixed++;
      } catch {
        // Function might not exist (not all projects use all functions) — skip silently
      }
    }

    if (fixed > 0) {
      this.log(`  ${chalk.green('✓')} Public invoker: ${ok + fixed} functions accessible (${fixed} just fixed)\n`);
    } else if (ok > 0) {
      this.log(`  ${chalk.green('✓')} Public invoker: ${ok} functions accessible\n`);
    }
  }

  getProjectId() {
    try {
      const firebaserc = jetpack.read(path.join(this.main.firebaseProjectPath, '.firebaserc'), 'json');
      return firebaserc?.projects?.default;
    } catch {
      return null;
    }
  }

  findGcloud() {
    const homeDir = require('os').homedir();
    const sdkPath = path.join(homeDir, 'google-cloud-sdk', 'bin', 'gcloud');

    if (jetpack.exists(sdkPath)) {
      return sdkPath;
    }

    // Try PATH
    try {
      execSync('which gcloud', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return 'gcloud';
    } catch {
      return null;
    }
  }
}

module.exports = DeployCommand;
