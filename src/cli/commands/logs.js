const BaseCommand = require('./base-command');
const chalk = require('chalk').default;
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const path = require('path');
const jetpack = require('fs-jetpack');
const { resolveProjectId } = require('./firebase-init');

const SEVERITY_COLORS = {
  DEFAULT: 'gray',
  DEBUG: 'gray',
  INFO: 'cyan',
  NOTICE: 'blue',
  WARNING: 'yellow',
  ERROR: 'red',
  CRITICAL: 'redBright',
  ALERT: 'redBright',
  EMERGENCY: 'redBright',
};

class LogsCommand extends BaseCommand {
  async execute() {
    const argv = this.main.argv;
    const args = argv._ || [];
    const subcommand = args[0]; // e.g., 'logs:read'
    const action = subcommand.split(':')[1];

    // Check gcloud is installed
    if (!this.isGcloudInstalled()) {
      this.logError('gcloud CLI is not installed or not in PATH.');
      this.log(chalk.gray('  Install it: https://cloud.google.com/sdk/docs/install'));
      return;
    }

    // Resolve project ID
    const projectId = this.resolveProject();
    if (!projectId) {
      this.logError('Could not resolve project ID.');
      this.log(chalk.gray('  Ensure functions/service-account.json, .firebaserc, or GCLOUD_PROJECT exists.'));
      return;
    }

    this.log(chalk.gray(`  Project: ${projectId}\n`));

    switch (action) {
      case 'read':
        return await this.read(projectId, argv);
      case 'tail':
      case 'stream':
        return await this.tail(projectId, argv);
      default:
        this.logError(`Unknown logs subcommand: ${action}`);
        this.log(chalk.gray('  Available: logs:read, logs:tail, logs:stream'));
    }
  }

  /**
   * Fetch historical logs.
   * Usage: npx bm logs:read [--fn bm_api] [--severity ERROR] [--since 1h] [--limit 300] [--search "text"] [--order desc] [--filter 'raw gcloud filter']
   */
  async read(projectId, argv) {
    const filter = this.buildFilter(argv);
    const limit = parseInt(argv.limit, 10) || 300;
    const order = argv.order || 'desc';

    const cmd = [
      'gcloud', 'logging', 'read',
      filter ? `'${filter}'` : '',
      `--project=${projectId}`,
      `--limit=${limit}`,
      '--format=json',
      `--order=${order}`,
    ].filter(Boolean).join(' ');

    // Set up log file in the project directory
    const projectDir = this.main.firebaseProjectPath;
    const logPath = path.join(projectDir, 'functions', 'logs.log');

    this.log(chalk.gray(`  Filter: ${filter || '(none)'}`));
    this.log(chalk.gray(`  Limit: ${limit}`));
    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 60000,
      });

      const entries = JSON.parse(output || '[]');

      // Save as newline-delimited JSON (matches tail format)
      jetpack.write(logPath, entries.map(e => JSON.stringify(e)).join('\n'));

      if (entries.length === 0) {
        this.logWarning('No log entries found.');
        return;
      }

      if (argv.raw) {
        this.log(JSON.stringify(entries, null, 2));
        return;
      }

      this.log(chalk.gray(`  Found ${entries.length} entries\n`));
      for (const entry of entries) {
        this.formatEntry(entry);
      }
    } catch (error) {
      if (error.status) {
        this.logError(`gcloud command failed (exit code ${error.status}):`);
        this.log(chalk.gray(error.stderr || error.message));
      } else {
        this.logError(`Failed to read logs: ${error.message}`);
      }
    }
  }

  /**
   * Poll for live logs by repeatedly running gcloud logging read.
   * Usage: npx bm logs:tail [--fn bm_api] [--severity ERROR] [--interval 5]
   */
  async tail(projectId, argv) {
    const interval = (parseInt(argv.interval, 10) || 5) * 1000;
    let lastTimestamp = new Date(Date.now() - 60000).toISOString(); // Start 1 min ago
    const seenIds = new Set();
    let stopped = false;

    // Set up log file in the project directory
    const projectDir = this.main.firebaseProjectPath;
    const logPath = path.join(projectDir, 'functions', 'logs.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });

    const filter = this.buildFilter(argv, { excludeTimestamp: true });
    this.log(chalk.gray(`  Filter: ${filter || '(none)'}`));
    this.log(chalk.gray(`  Polling every ${interval / 1000}s`));
    this.log(chalk.gray(`  Logs saving to: ${logPath}`));
    this.log(chalk.gray('  Tailing logs (Ctrl+C to stop)...\n'));

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      stopped = true;
    });

    while (!stopped) {
      try {
        const timestampFilter = `timestamp>="${lastTimestamp}"`;
        const fullFilter = filter
          ? `${filter} AND ${timestampFilter}`
          : `${timestampFilter}`;

        const cmd = [
          'gcloud', 'logging', 'read',
          `'${fullFilter}'`,
          `--project=${projectId}`,
          '--limit=100',
          '--format=json',
          '--order=asc',
        ].join(' ');

        const output = execSync(cmd, {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 15000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const entries = JSON.parse(output || '[]');

        for (const entry of entries) {
          // Deduplicate using insertId
          const entryId = entry.insertId || `${entry.timestamp}-${entry.textPayload || ''}`;
          if (seenIds.has(entryId)) {
            continue;
          }
          seenIds.add(entryId);

          // Write to log file
          logStream.write(JSON.stringify(entry) + '\n');

          // Display
          if (argv.raw) {
            this.log(JSON.stringify(entry));
          } else {
            this.formatEntry(entry);
          }

          // Advance timestamp watermark
          if (entry.timestamp && entry.timestamp > lastTimestamp) {
            lastTimestamp = entry.timestamp;
          }
        }

        // Cap seenIds to prevent memory leak
        if (seenIds.size > 5000) {
          const arr = [...seenIds];
          arr.splice(0, arr.length - 2500);
          seenIds.clear();
          arr.forEach(id => seenIds.add(id));
        }
      } catch (error) {
        // Silently skip transient errors during polling
        if (error.status) {
          this.log(chalk.gray(`  (poll error: ${(error.stderr || error.message).trim().split('\n')[0]})`));
        }
      }

      // Wait before next poll
      if (!stopped) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    logStream.end();
    this.log(chalk.gray('\n  Tail stopped.'));
  }

  /**
   * Build a gcloud logging filter string from CLI flags.
   */
  buildFilter(argv, options = {}) {
    const parts = [];

    // Always scope to Cloud Functions
    parts.push('resource.type="cloud_function"');

    // Function name filter
    if (argv.fn) {
      parts.push(`resource.labels.function_name="${argv.fn}"`);
    }

    // Severity filter
    if (argv.severity) {
      parts.push(`severity>=${argv.severity.toUpperCase()}`);
    }

    // Text search filter (searches textPayload)
    if (argv.search) {
      parts.push(`textPayload:"${argv.search}"`);
    }

    // Raw filter passthrough (appended as-is)
    if (argv.filter) {
      parts.push(argv.filter);
    }

    // Timestamp filter (read only, not tail)
    if (!options.excludeTimestamp) {
      const since = argv.since || '1h';
      const timestamp = this.parseSince(since);
      if (timestamp) {
        parts.push(`timestamp>="${timestamp}"`);
      }
    }

    return parts.join(' AND ');
  }

  /**
   * Parse a human-friendly duration (e.g., '1h', '2d', '30m') into an ISO timestamp.
   */
  parseSince(since) {
    const match = since.match(/^(\d+)([mhdw])$/);
    if (!match) {
      this.logWarning(`Invalid --since format: "${since}". Use e.g., 30m, 1h, 2d, 1w`);
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = new Date();

    switch (unit) {
      case 'm': now.setMinutes(now.getMinutes() - value); break;
      case 'h': now.setHours(now.getHours() - value); break;
      case 'd': now.setDate(now.getDate() - value); break;
      case 'w': now.setDate(now.getDate() - (value * 7)); break;
    }

    return now.toISOString();
  }

  /**
   * Pretty-print a single log entry.
   */
  formatEntry(entry) {
    const severity = entry.severity || 'DEFAULT';
    const colorFn = chalk[SEVERITY_COLORS[severity] || 'white'];
    const timestamp = entry.timestamp || entry.receiveTimestamp || '';
    const fnName = entry.resource?.labels?.function_name || '';

    // Extract the actual message
    let message = '';
    if (entry.textPayload) {
      message = entry.textPayload;
    } else if (entry.jsonPayload) {
      message = typeof entry.jsonPayload.message === 'string'
        ? entry.jsonPayload.message
        : JSON.stringify(entry.jsonPayload, null, 2);
    } else if (entry.protoPayload) {
      message = JSON.stringify(entry.protoPayload, null, 2);
    }

    // Format timestamp to local time
    let timeStr = '';
    if (timestamp) {
      const date = new Date(timestamp);
      timeStr = date.toLocaleTimeString();
    }

    const severityTag = colorFn(`[${severity.padEnd(8)}]`);
    const fnTag = fnName ? chalk.blue(`[${fnName}]`) : '';
    const timeTag = chalk.gray(timeStr);

    this.log(`${timeTag} ${severityTag} ${fnTag} ${message}`);
  }

  /**
   * Resolve the project ID without initializing firebase-admin.
   */
  resolveProject() {
    const projectDir = this.firebaseProjectPath;
    const functionsDir = path.join(projectDir, 'functions');

    // Try service-account.json first (most reliable for production)
    const serviceAccountPath = path.join(functionsDir, 'service-account.json');
    if (jetpack.exists(serviceAccountPath)) {
      try {
        const sa = JSON.parse(jetpack.read(serviceAccountPath));
        if (sa.project_id) {
          return sa.project_id;
        }
      } catch (e) {
        // Fall through
      }
    }

    // Fall back to shared resolver
    return resolveProjectId(projectDir, functionsDir);
  }

  /**
   * Check if gcloud CLI is available.
   */
  isGcloudInstalled() {
    try {
      execSync('gcloud --version', { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = LogsCommand;
