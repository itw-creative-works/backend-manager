const BaseCommand = require('./base-command');
const path = require('path');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const { execSync, spawn } = require('child_process');

class WatchCommand extends BaseCommand {
  /**
   * Get watch configuration (shared between execute and startBackground)
   */
  getConfig() {
    const projectDir = this.main.firebaseProjectPath;
    const functionsDir = path.join(projectDir, 'functions');
    const bemDir = path.resolve(__dirname, '..', '..', '..');
    const bemSrcDir = path.join(bemDir, 'src');
    const triggerFile = path.join(functionsDir, 'bem-reload-trigger.js');

    return { projectDir, functionsDir, bemDir, bemSrcDir, triggerFile };
  }

  /**
   * Check if nodemon is available
   */
  getNodemonPath() {
    try {
      return execSync('which nodemon', { encoding: 'utf8' }).trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Start watcher in background (called from other commands)
   */
  startBackground() {
    const config = this.getConfig();
    const nodemonPath = this.getNodemonPath();

    if (!nodemonPath) {
      this.log(chalk.gray('  (BEM watch disabled - install nodemon globally to enable)\n'));
      return null;
    }

    this.log(chalk.gray(`  BEM watch: ${config.bemSrcDir}\n`));

    // Create trigger file if it doesn't exist
    if (!jetpack.exists(config.triggerFile)) {
      jetpack.write(config.triggerFile, `// BEM reload trigger\n`);
    }

    // Use nodemon to watch the BEM src directory and update trigger file on changes
    // Note: Firebase only triggers on file content changes (not create/delete)
    // So we must: 1) ensure file exists, 2) wait for FS to settle, 3) write new content
    // --on-change-only: only run exec when files change, not on initial startup
    // --delay 1: debounce multiple rapid changes into one trigger
    const triggerFile = config.triggerFile;
    const nodemon = spawn(nodemonPath, [
      '--on-change-only',
      '--delay', '1',
      '--watch', config.bemSrcDir,
      '--ext', 'js,json',
      '--exec', `node -e "var f='${triggerFile}',fs=require('fs');if(!fs.existsSync(f)){fs.writeFileSync(f,'// init');require('child_process').execSync('sleep 0.1');}fs.writeFileSync(f,'// '+Date.now())" && echo "  [BEM] Triggered hot reload"`,
    ], {
      stdio: 'inherit',
      detached: false,
      cwd: config.bemDir,
    });

    return nodemon;
  }

  /**
   * Interactive execute (bem watch)
   */
  async execute() {
    const config = this.getConfig();
    const nodemonPath = this.getNodemonPath();

    if (!nodemonPath) {
      this.logWarning('\n  Warning: nodemon is not installed globally.');
      this.log(chalk.gray('  Install it with: npm install -g nodemon\n'));
      return;
    }

    this.log(chalk.cyan('\n  BEM Watch Mode\n'));
    this.log(chalk.gray(`  Watching: ${config.bemSrcDir}`));
    this.log(chalk.gray(`  Trigger:  ${config.triggerFile}\n`));
    this.log(chalk.gray('  When BEM source files change, this will trigger Firebase emulator hot reload.'));
    this.log(chalk.gray('  Press Ctrl+C to stop watching.\n'));

    // Create trigger file if it doesn't exist
    if (!jetpack.exists(config.triggerFile)) {
      jetpack.write(config.triggerFile, `// BEM reload trigger\n`);
    }

    // Use nodemon to watch the BEM src directory and touch the trigger file on changes
    const nodemon = spawn(nodemonPath, [
      '--watch', config.bemSrcDir,
      '--ext', 'js,json',
      '--exec', `touch "${config.triggerFile}" && echo "  → Triggered hot reload"`,
    ], {
      stdio: 'inherit',
      cwd: config.bemDir,
    });

    nodemon.on('error', (error) => {
      this.logError(`  Nodemon error: ${error.message}`);
    });

    nodemon.on('close', (code) => {
      if (code !== 0 && code !== null) {
        this.logError(`  Nodemon exited with code ${code}`);
      }
    });

    // Keep the process running
    await new Promise(() => {});
  }
}

module.exports = WatchCommand;
