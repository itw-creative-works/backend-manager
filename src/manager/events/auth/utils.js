const jetpack = require('fs-jetpack');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Retry a function up to maxRetries times with exponential backoff
 */
async function retryWrite(assistant, tag, fn) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error;
      assistant.error(`${tag}: Write attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        assistant.log(`${tag}: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}

/**
 * Run consumer auth hooks from hooks/auth/{eventName}.js
 *
 * Similar to how cron discovers hooks at hooks/cron/{schedule}/*.js,
 * auth hooks are discovered at hooks/auth/{eventName}.js in the consumer project.
 *
 * For blocking functions (before-create, before-signin):
 *   - Hook can throw HttpsError to block the operation
 *   - Hook runs AFTER BEM's core checks (disposable email, rate limiting, etc.)
 *
 * For trigger functions (on-create, on-delete):
 *   - Hook errors are logged but don't block the operation
 *
 * Hook signature:
 *   module.exports = async ({ Manager, assistant, user, context, libraries }) => { ... }
 *
 * Consumer project structure:
 *   functions/
 *     hooks/
 *       auth/
 *         before-create.js   — runs after BEM checks, can block signup
 *         before-signin.js   — runs after BEM signin logic, can block signin
 *         on-create.js       — runs after BEM creates user doc
 *         on-delete.js       — runs after BEM deletes user doc
 */
async function runAuthHook(eventName, args) {
  const { Manager, assistant } = args;
  const hookPath = `${Manager.cwd}/hooks/auth/${eventName}.js`;

  // Check if hook file exists
  if (!jetpack.exists(hookPath)) {
    return;
  }

  assistant.log(`${eventName}: Running consumer hook @ ${hookPath}`);

  // Load and execute — passes the same args object the BEM handler received
  const hook = require(hookPath);
  await hook(args);

  assistant.log(`${eventName}: Consumer hook completed`);
}

module.exports = { retryWrite, runAuthHook, MAX_RETRIES };
