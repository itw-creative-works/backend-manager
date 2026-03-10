const jetpack = require('fs-jetpack');

/**
 * Shared cron job runner
 *
 * Discovers and executes all .js job files from:
 * 1. BEM core jobs directory
 * 2. Custom project hooks directory
 *
 * @param {string} name - Cron schedule name (e.g., 'daily', 'frequent')
 * @param {object} options
 * @param {object} options.Manager - Manager instance
 * @param {object} options.assistant - Assistant instance
 * @param {object} options.context - Cloud Function context
 */
module.exports = async function run(name, { Manager, assistant, context }) {
  // Set log prefix
  assistant.setLogPrefix(`cron/${name}()`);

  // Log
  assistant.log('Starting...');

  // Load BEM jobs
  await loadAndExecuteJobs(name, `${__dirname}/${name}`, Manager, context);

  // Load custom jobs
  await loadAndExecuteJobs(name, `${Manager.cwd}/hooks/cron/${name}`, Manager, context);
};

async function loadAndExecuteJobs(name, jobsPath, Manager, context) {
  const jobs = jetpack.list(jobsPath) || [];

  // Log
  Manager.assistant.log(`Located ${jobs.length} jobs @ ${jobsPath}...`);

  for (const job of jobs) {
    // Create new assistant for each job
    const assistant = Manager.Assistant();

    // Load job
    const jobName = job.replace('.js', '');

    // Set log prefix
    assistant.setLogPrefix(`cron/${name}/${jobName}()`);

    // Log
    assistant.log('Starting...');

    try {
      // Load and execute job
      const handler = require(`${jobsPath}/${job}`);
      await handler({ Manager, assistant, context, libraries: Manager.libraries });

      assistant.log('Completed!');
    } catch (e) {
      assistant.errorify(`Error executing: ${e}`, { code: 500, sentry: true });
      throw e;
    }
  }
}
