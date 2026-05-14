/**
 * Regex patterns that indicate junk local parts (checked after stripping +suffix).
 * Kept as JS (not JSON) so patterns stay as native RegExp literals.
 */
module.exports = [
  /^\d+$/,           // All numeric: 123456
  /^(.)\1{2,}$/,     // Repeating single char: aaaa, xxxx
  /^[a-z]{1,2}\d+$/, // Single letter + numbers: a123, x999
  /^test[._-]/,      // Starts with test separator: test.user, test_123
];
