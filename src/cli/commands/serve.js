const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk').default;
const powertools = require('node-powertools');
const jetpack = require('fs-jetpack');
const WatchCommand = require('./watch');

class ServeCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const projectDir = self.firebaseProjectPath;
    const firebaseConfig = JSON.parse(fs.readFileSync(path.join(projectDir, 'firebase.json'), 'utf8'));
    const port = parseInt(self.argv.port || self.argv?._?.[1] || firebaseConfig?.emulators?.hosting?.port || '5000', 10);

    // HTTPS: proxy on the public port (5002), firebase serve on an internal port (5443).
    // All services connect to https://localhost:5002. Disable with --no-https.
    const httpsEnabled = self.argv.https !== false;
    const internalPort = 5443;

    // Check for port conflicts before starting server
    const portsToCheck = httpsEnabled
      ? { 'HTTPS': port, 'internal': internalPort }
      : { serving: port };
    const canProceed = await this.checkAndKillBlockingProcesses(portsToCheck);
    if (!canProceed) {
      throw new Error('Port conflicts could not be resolved');
    }

    // Wipe stale firebase-tools debug logs + any leftover BEM logs from older
    // versions. Keeps the project tree clean across runs.
    this.sweepStaleLogs();

    // Start BEM watcher in background
    const watcher = new WatchCommand(self);
    watcher.startBackground();

    // Start Stripe webhook forwarding in background
    this.startStripeWebhookForwarding();

    // Start HTTPS proxy if enabled
    if (httpsEnabled) {
      await this._startHttpsProxy(port, internalPort, projectDir);
    }

    // Set up log file in the project directory.
    const logPath = this.getLogsPath('dev.log');
    const resetSentinelPath = this.getTempPath('dev.log.reset');
    const RELOAD_MARKER = /Using node@\d+ from host\./;
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    let currentStream = fs.createWriteStream(logPath, { flags: 'w' });
    let reloadCount = 0;

    function rollLog() {
      try {
        const oldStream = currentStream;
        currentStream = fs.createWriteStream(logPath, { flags: 'w' });
        oldStream.end();
      } catch (e) {
        // Best-effort.
      }
    }

    function writeToLog(data) {
      if (currentStream && !currentStream.destroyed) {
        currentStream.write(stripAnsi(data.toString()));
      }
    }

    // Clean up any stale sentinel from a prior crashed serve run
    try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* not present, ok */ }

    // Poll every 500ms for the reset sentinel
    const resetWatcher = setInterval(() => {
      if (!fs.existsSync(resetSentinelPath)) {
        return;
      }

      try {
        rollLog();
        fs.unlinkSync(resetSentinelPath);
      } catch (e) {
        // Best-effort.
      }
    }, 500);

    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    // Execute with tee to log file
    const firebasePort = httpsEnabled ? internalPort : port;
    const firebaseEnv = {
      ...process.env,
      FORCE_COLOR: '1',
    };

    if (httpsEnabled) {
      // Internal calls (getApiUrl → BEMClient) loop through the HTTPS proxy with a self-signed cert
      firebaseEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      firebaseEnv.BEM_HTTPS_PORT = String(port);
    }

    try {
      await powertools.execute(`firebase serve --port ${firebasePort}`, {
        log: false,
        cwd: projectDir,
        config: {
          stdio: ['inherit', 'pipe', 'pipe'],
          env: firebaseEnv,
        },
      }, (child) => {
        child.stdout.on('data', (data) => {
          process.stdout.write(data);
          const text = data.toString();
          if (RELOAD_MARKER.test(text)) {
            reloadCount++;
            if (reloadCount > 1) {
              rollLog();
            }
          }
          writeToLog(data);
        });

        child.stderr.on('data', (data) => {
          process.stderr.write(data);
          writeToLog(data);
        });

        child.on('close', () => {
          clearInterval(resetWatcher);
          if (currentStream && !currentStream.destroyed) {
            currentStream.end();
          }
          try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* ok */ }
        });
      });
    } catch (error) {
      this.log(chalk.gray('\n  Server stopped.\n'));
    }
  }

  async _startHttpsProxy(httpsPort, httpPort, projectDir) {
    const https = require('https');
    const http = require('http');

    const certs = await this._getHttpsCerts(projectDir);

    if (!certs) {
      this.log(chalk.yellow('  HTTPS disabled — could not obtain certificates.'));
      this.log(chalk.yellow('  Install mkcert for trusted local HTTPS: brew install mkcert && mkcert -install\n'));
      return;
    }

    const options = {
      key: fs.readFileSync(certs.key),
      cert: fs.readFileSync(certs.cert),
    };

    const proxy = https.createServer(options, (clientReq, clientRes) => {
      const proxyOpts = {
        hostname: 'localhost',
        port: httpPort,
        path: clientReq.url,
        method: clientReq.method,
        headers: {
          ...clientReq.headers,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': clientReq.headers.host,
        },
      };

      const proxyReq = http.request(proxyOpts, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
      });

      proxyReq.on('error', (err) => {
        clientRes.writeHead(502);
        clientRes.end(`Proxy error: ${err.message}`);
      });

      clientReq.pipe(proxyReq, { end: true });
    });

    proxy.listen(httpsPort, () => {
      this.log(chalk.green(`  HTTPS proxy listening on https://localhost:${httpsPort}`));
      this.log(chalk.gray(`  Forwarding to http://localhost:${httpPort} (firebase serve)\n`));
    });

    proxy.on('error', (err) => {
      this.log(chalk.red(`  HTTPS proxy error: ${err.message}`));
    });
  }

  async _getHttpsCerts(projectDir) {
    const tempDir = this.getTempPath();

    const certsDir = path.join(tempDir, 'certs');
    jetpack.dir(certsDir);

    // Check if mkcert certificates already exist
    const certFiles = (jetpack.find(certsDir, { matching: 'localhost*.pem' }) || []);
    const keyFile = certFiles.find((f) => f.includes('-key.pem'));
    const certFile = certFiles.find((f) => !f.includes('-key.pem'));

    if (keyFile && certFile) {
      this.log(chalk.gray('  Using existing mkcert certificates from .temp/certs/'));
      return { key: keyFile, cert: certFile };
    }

    // Try to generate with mkcert
    return this._generateMkcertCerts(certsDir);
  }

  async _generateMkcertCerts(certsDir) {
    try {
      await powertools.execute('which mkcert', { log: false });
    } catch (e) {
      this.log(chalk.yellow('  mkcert not found. Install with: brew install mkcert && mkcert -install'));
      return null;
    }

    try {
      await powertools.execute('mkcert -install', { log: false });
    } catch (e) {
      // CA may already be installed
    }

    this.log(chalk.gray('  Generating mkcert certificates...'));

    // Get local network IP for the cert SAN
    const os = require('os');
    const hosts = ['localhost', '127.0.0.1', '::1'];
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          hosts.push(iface.address);
          break;
        }
      }
    }

    try {
      await powertools.execute(`cd "${certsDir}" && mkcert ${hosts.join(' ')}`, { log: false });

      const certFiles = (jetpack.find(certsDir, { matching: 'localhost*.pem' }) || []);
      const keyFile = certFiles.find((f) => f.includes('-key.pem'));
      const certFile = certFiles.find((f) => !f.includes('-key.pem'));

      if (keyFile && certFile) {
        this.log(chalk.green('  Trusted HTTPS certificates generated in .temp/'));
        return { key: keyFile, cert: certFile };
      }

      return null;
    } catch (e) {
      this.log(chalk.yellow(`  Failed to generate certificates: ${e.message}`));
      return null;
    }
  }
}

module.exports = ServeCommand;
