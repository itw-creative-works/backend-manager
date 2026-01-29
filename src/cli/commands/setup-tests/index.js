/**
 * Test Registry
 * Manages the order and execution of all setup tests
 */

// Import all test classes in the order they should run
const IsFirebaseProjectTest = require('./is-firebase-project');
const NodeVersionTest = require('./node-version');
const NvmrcVersionTest = require('./nvmrc-version');
const FirebaseCLITest = require('./firebase-cli');
const FunctionsPackageTest = require('./functions-package');
const FirebaseAdminTest = require('./firebase-admin');
const FirebaseFunctionsTest = require('./firebase-functions');
const BackendManagerTest = require('./backend-manager');
const NpmProjectScriptsTest = require('./npm-project-scripts');
const BemConfigTest = require('./bem-config');
const ProjectIdConsistencyTest = require('./project-id-consistency');
const ServiceAccountTest = require('./service-account');
const GitignoreTest = require('./gitignore');
const EnvFileTest = require('./env-file');
const EnvRuntimeConfigDeprecatedTest = require('./env-runtime-config-deprecated');
const FirestoreRulesInJsonTest = require('./firestore-rules-in-json');
const FirestoreIndexesInJsonTest = require('./firestore-indexes-in-json');
const RealtimeRulesInJsonTest = require('./realtime-rules-in-json');
const StorageRulesInJsonTest = require('./storage-rules-in-json');
const RemoteconfigTemplateInJsonTest = require('./remoteconfig-template-in-json');
const EmulatorsConfigTest = require('./emulators-config');
const HostingRewritesTest = require('./hosting-rewrites');
const FirestoreIndexesSyncedTest = require('./firestore-indexes-synced');
const StorageLifecyclePolicyTest = require('./storage-lifecycle-policy');
const FirestoreRulesFileTest = require('./firestore-rules-file');
const FirestoreIndexesFileTest = require('./firestore-indexes-file');
const RealtimeRulesFileTest = require('./realtime-rules-file');
const StorageRulesFileTest = require('./storage-rules-file');
const RemoteconfigTemplateFileTest = require('./remoteconfig-template-file');
const HostingFolderTest = require('./hosting-folder');
const PublicHtmlFilesTest = require('./public-html-files');
const LegacyTestsCleanupTest = require('./legacy-tests-cleanup');

/**
 * Get all tests in the order they should run
 * @param {Object} context - The test context containing main and other dependencies
 * @returns {Array} Array of test instances
 */
function getTests(context) {
  return [
    new IsFirebaseProjectTest(context),
    new NodeVersionTest(context),
    new NvmrcVersionTest(context),
    new FirebaseCLITest(context),
    new FunctionsPackageTest(context),
    new FirebaseAdminTest(context),
    new FirebaseFunctionsTest(context),
    new BackendManagerTest(context),
    new NpmProjectScriptsTest(context),
    new BemConfigTest(context),
    new ServiceAccountTest(context),
    new ProjectIdConsistencyTest(context),
    new GitignoreTest(context),
    new EnvFileTest(context),
    new EnvRuntimeConfigDeprecatedTest(context),
    new FirestoreRulesInJsonTest(context),
    new FirestoreIndexesInJsonTest(context),
    new RealtimeRulesInJsonTest(context),
    new StorageRulesInJsonTest(context),
    new RemoteconfigTemplateInJsonTest(context),
    new EmulatorsConfigTest(context),
    new HostingRewritesTest(context),
    new FirestoreIndexesSyncedTest(context),
    new StorageLifecyclePolicyTest(context),
    new FirestoreRulesFileTest(context),
    new FirestoreIndexesFileTest(context),
    new RealtimeRulesFileTest(context),
    new StorageRulesFileTest(context),
    new RemoteconfigTemplateFileTest(context),
    new HostingFolderTest(context),
    new PublicHtmlFilesTest(context),
    new LegacyTestsCleanupTest(context),
  ];
}

module.exports = {
  getTests,
};
