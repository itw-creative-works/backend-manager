#!/usr/bin/env node

/**
 * BEM Test Runner Entry Point
 * This script is executed by the CLI test command inside firebase emulators:exec
 * It reads configuration from BEM_TEST_CONFIG environment variable and runs the test suite
 */

const TestRunner = require('./runner.js');

async function main() {
  // Parse config from single env var
  const testConfig = JSON.parse(process.env.BEM_TEST_CONFIG || '{}');

  // Initialize Firebase Admin with emulator settings
  let admin = null;
  try {
    const firebaseAdmin = require('firebase-admin');

    // Check if already initialized
    if (firebaseAdmin.apps.length === 0) {
      // When running in emulator, we can initialize without credentials
      // The emulator environment variables tell it where to connect
      firebaseAdmin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || testConfig.appId,
      });
    }
    admin = firebaseAdmin;
  } catch (error) {
    console.error('Warning: Could not initialize Firebase Admin:', error.message);
  }

  // Create and run the test runner
  const runner = new TestRunner({
    ...testConfig,
    admin,
  });

  const results = await runner.run();

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
