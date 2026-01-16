const jetpack = require('fs-jetpack');

/**
 * Daily cron job runner
 *
 * Executes all daily jobs from:
 * 1. BEM core jobs (src/manager/cron/daily/)
 * 2. Custom project jobs (functions/hooks/cron/daily/)
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  // Set log prefix
  assistant.setLogPrefix('cron/daily()');

  // Log
  assistant.log('Starting...');

  // Load BEM jobs
  await loadAndExecuteJobs(`${__dirname}/daily`, Manager, context);

  // Load custom jobs
  await loadAndExecuteJobs(`${Manager.cwd}/hooks/cron/daily`, Manager, context);
};

async function loadAndExecuteJobs(jobsPath, Manager, context) {
  const jobs = jetpack.list(jobsPath) || [];

  // Log
  Manager.assistant.log(`Located ${jobs.length} jobs @ ${jobsPath}...`);

  for (const job of jobs) {
    // Create new assistant for each job
    const assistant = Manager.Assistant();

    // Load job
    const jobName = job.replace('.js', '');

    // Set log prefix
    assistant.setLogPrefix(`cron/daily/${jobName}()`);

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
