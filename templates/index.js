/*
  Initialize
*/
const Manager = (new (require('backend-manager'))).init(exports, {
});
const { functions } = Manager.libraries;

/*
  Routes
  Add custom routes below. Built-in routes (auth, payments, newsletters,
  usage, etc.) are registered automatically by Backend Manager.
*/
