/*
  BEM self-test fixture — a minimal consumer backend used ONLY when the framework
  tests itself (`npx mgr test` run from the backend-manager repo). The runner points
  BEM_TEST_BOOT_PROJECT here and symlinks the local backend-manager into
  functions/node_modules so the emulator's function workers resolve it.

  Mirrors a real consumer's functions/index.js: one-line BEM bootstrap.
*/
const Manager = (new (require('backend-manager'))).init(exports, {});
const { functions } = Manager.libraries;
