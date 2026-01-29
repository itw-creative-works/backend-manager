const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

// Default emulator ports - SSOT for fallback values
const DEFAULT_EMULATOR_PORTS = {
  auth: 9099,
  functions: 5001,
  firestore: 8080,
  database: 9000,
  hosting: 5002,
  storage: 9199,
  pubsub: 8085,
  ui: 4050,
};

const REQUIRED_EMULATORS = {
  auth: { port: DEFAULT_EMULATOR_PORTS.auth },
  functions: { port: DEFAULT_EMULATOR_PORTS.functions },
  firestore: { port: DEFAULT_EMULATOR_PORTS.firestore },
  database: { port: DEFAULT_EMULATOR_PORTS.database },
  hosting: { port: DEFAULT_EMULATOR_PORTS.hosting },
  storage: { port: DEFAULT_EMULATOR_PORTS.storage },
  pubsub: { port: DEFAULT_EMULATOR_PORTS.pubsub },
  ui: { enabled: true, port: DEFAULT_EMULATOR_PORTS.ui },
};

class EmulatorsConfigTest extends BaseTest {
  getName() {
    return 'emulators config in firebase.json';
  }

  async run() {
    const emulators = this.self.firebaseJSON?.emulators;

    if (!emulators) {
      return false;
    }

    // Check each required emulator
    for (const [name, config] of Object.entries(REQUIRED_EMULATORS)) {
      if (!emulators[name]) {
        return false;
      }

      // Check all required properties
      for (const [key, value] of Object.entries(config)) {
        if (emulators[name][key] !== value) {
          return false;
        }
      }
    }

    // Check singleProjectMode
    if (emulators.singleProjectMode !== true) {
      return false;
    }

    return true;
  }

  async fix() {
    // Set each emulator config
    for (const [name, config] of Object.entries(REQUIRED_EMULATORS)) {
      for (const [key, value] of Object.entries(config)) {
        _.set(this.self.firebaseJSON, `emulators.${name}.${key}`, value);
      }
    }

    // Set singleProjectMode
    _.set(this.self.firebaseJSON, 'emulators.singleProjectMode', true);

    // Write updated config
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = EmulatorsConfigTest;
module.exports.DEFAULT_EMULATOR_PORTS = DEFAULT_EMULATOR_PORTS;