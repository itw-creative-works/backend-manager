const path = require('path');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulator-config');

/**
 * Initialize firebase-admin for CLI commands.
 *
 * @param {object} options
 * @param {string} options.firebaseProjectPath - Project root (from main.firebaseProjectPath)
 * @param {boolean} options.emulator - Whether to target the local emulator
 * @returns {{ admin: object, projectId: string }}
 */
function initFirebase({ firebaseProjectPath, emulator }) {
  const functionsDir = path.join(firebaseProjectPath, 'functions');

  // Load .env so env vars like GCLOUD_PROJECT are available
  const envPath = path.join(functionsDir, '.env');
  if (jetpack.exists(envPath)) {
    require('dotenv').config({ path: envPath, quiet: true });
  }

  // Resolve firebase-admin from the consumer project's node_modules (peer dep)
  const admin = require(path.join(functionsDir, 'node_modules', 'firebase-admin'));

  // Already initialized
  if (admin.apps.length > 0) {
    const projectId = admin.apps[0].options.projectId || 'unknown';
    return { admin, projectId };
  }

  if (emulator) {
    // Load emulator ports from firebase.json
    const emulatorPorts = loadEmulatorPorts(firebaseProjectPath);

    // Set emulator env vars so firebase-admin connects to emulator
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST
      || `127.0.0.1:${emulatorPorts.firestore}`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
      || `127.0.0.1:${emulatorPorts.auth}`;

    const projectId = resolveProjectId(firebaseProjectPath, functionsDir);

    admin.initializeApp({ projectId });

    return { admin, projectId };
  }

  // Production: use service-account.json
  const serviceAccountPath = path.join(functionsDir, 'service-account.json');
  if (!jetpack.exists(serviceAccountPath)) {
    throw new Error(
      `Missing service-account.json at ${serviceAccountPath}\n`
      + `  Download it from Firebase Console > Project Settings > Service Accounts`,
    );
  }

  const serviceAccount = JSON.parse(jetpack.read(serviceAccountPath));
  const projectId = serviceAccount.project_id;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${projectId}.firebaseio.com`,
  });

  return { admin, projectId };
}

function loadEmulatorPorts(projectDir) {
  const emulatorPorts = { ...DEFAULT_EMULATOR_PORTS };
  const firebaseJsonPath = path.join(projectDir, 'firebase.json');

  if (jetpack.exists(firebaseJsonPath)) {
    try {
      const firebaseConfig = JSON5.parse(jetpack.read(firebaseJsonPath));

      if (firebaseConfig.emulators) {
        for (const name of Object.keys(DEFAULT_EMULATOR_PORTS)) {
          emulatorPorts[name] = firebaseConfig.emulators[name]?.port || DEFAULT_EMULATOR_PORTS[name];
        }
      }
    } catch (e) {
      // Use defaults
    }
  }

  return emulatorPorts;
}

function resolveProjectId(projectDir, functionsDir) {
  // Try backend-manager-config.json
  const configPath = path.join(functionsDir, 'backend-manager-config.json');
  if (jetpack.exists(configPath)) {
    try {
      const config = JSON5.parse(jetpack.read(configPath));
      if (config.firebaseConfig?.projectId) {
        return config.firebaseConfig.projectId;
      }
    } catch (e) {
      // Fall through
    }
  }

  // Try .firebaserc
  const rcPath = path.join(projectDir, '.firebaserc');
  if (jetpack.exists(rcPath)) {
    try {
      const rc = JSON.parse(jetpack.read(rcPath));
      if (rc.projects?.default) {
        return rc.projects.default;
      }
    } catch (e) {
      // Fall through
    }
  }

  // Fallback to env
  return process.env.GCLOUD_PROJECT || 'demo-project';
}

module.exports = { initFirebase, resolveProjectId };
