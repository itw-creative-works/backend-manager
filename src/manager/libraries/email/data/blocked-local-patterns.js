/**
 * Regex patterns that indicate junk local parts (checked after stripping +suffix).
 * Kept as JS (not JSON) so patterns stay as native RegExp literals.
 */
module.exports = [
  /^\d+$/,                // All numeric: 123456
  /^(.)\1{2,}$/,          // Repeating single char: aaaa, xxxx
  /^[a-z]{1,2}\d+$/,      // Single letter + numbers: a123, x999
  /^test/,                // Starts with test: test, testuser, test123, test.user
  /^example/,             // Starts with example: example, exampleuser, example.user
  // Test-suite accounts use `_test.<scenario>@...` so they don't collide with
  // real signups. Block them from reaching SendGrid/Beehiiv so live lists stay
  // clean. `_test.allow_*` is the carved-out exception for live-provider
  // integration tests that intentionally need to round-trip a real contact.
  /^_test\.(?!allow_)/,
];
