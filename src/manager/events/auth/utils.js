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

module.exports = { retryWrite, MAX_RETRIES };
