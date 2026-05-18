#!/usr/bin/env node

/**
 * BEM Test Runner Entry Point
 * This script is executed by the CLI test command inside the Firebase emulator
 * It reads configuration from BEM_TEST_CONFIG environment variable and runs the test suite
 */

// Mark this process as the test runner BEFORE loading any BEM code. Manager.init()
// auto-detects this and skips Firebase Functions / server / Sentry wiring (which
// can't run outside a real Functions runtime). This is what lets tests receive a
// fully-wired Manager + assistant in their context — no per-test stub.
process.env.BEM_TEST_RUNNER = '1';

const path = require('path');
const TestRunner = require('./runner.js');

async function main() {
  // Parse config from base64-encoded env var
  const configBase64 = process.env.BEM_TEST_CONFIG || '';
  const testConfig = configBase64
    ? JSON.parse(Buffer.from(configBase64, 'base64').toString('utf8'))
    : {};

  // Initialize Firebase Admin with emulator settings
  let admin = null;
  try {
    const firebaseAdmin = require('firebase-admin');

    // Check if already initialized
    if (firebaseAdmin.apps.length === 0) {
      // When running in emulator, we can initialize without credentials
      // The emulator environment variables tell it where to connect
      firebaseAdmin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || testConfig.firebaseConfig?.projectId,
      });
    }
    admin = firebaseAdmin;
  } catch (error) {
    console.error('Warning: Could not initialize Firebase Admin:', error.message);
  }

  // Boot a real Manager. With BEM_TEST_RUNNER set, init() loads libraries +
  // resolves project config but skips the parts that need a Functions runtime
  // (handler wiring, server boot, Sentry, admin.initializeApp re-init).
  // The resulting Manager + assistant are passed into every test context, so
  // tests can call Manager.AI(), Manager.Email(), Manager.User(), etc. exactly
  // like production code does — no hand-rolled stubs.
  let Manager = null;
  let assistant = null;
  try {
    const projectDir = testConfig.projectDir || process.cwd();
    const BackendManager = require('../manager/index.js');
    Manager = new BackendManager();
    Manager.init(null, {
      cwd: path.join(projectDir, 'functions'),
      log: false,
    });
    assistant = Manager.Assistant({}, { functionName: 'bem-test-runner', accept: 'json' });
  } catch (error) {
    console.error('Warning: Could not initialize BEM Manager for tests:', error.message);
  }

  // Create and run the test runner
  const runner = new TestRunner({
    ...testConfig,
    admin,
    Manager,
    assistant,
  });

  const results = await runner.run();

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
