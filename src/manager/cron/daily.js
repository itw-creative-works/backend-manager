const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;

  // Shortcuts
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant();

  self.context = data.context;

  return self;
}

Module.prototype.main = function() {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    // Set log prefix
    assistant.setLogPrefix('cron/daily()');

    // Log
    assistant.log(`Starting...`);

    // Setup error
    let error;

    // Load BEM jobs
    await loadAndExecuteJobs(`${__dirname}/daily`, Manager, context).catch((e) => error = e);

    // Load custom jobs
    await loadAndExecuteJobs(`${Manager.cwd}/hooks/cron/daily`, Manager, context).catch((e) => error = e);

    // If there was an error, reject
    if (error) {
      return reject(error);
    }

    // Return
    return resolve();
  });
}

function loadAndExecuteJobs(jobsPath, Manager, context) {
  const assistant = Manager.assistant;

  return new Promise(async function(resolve, reject) {
    const jobs = jetpack.list(jobsPath) || [];
    let caught;

    // Log
    assistant.log(`Located ${jobs.length} jobs @ ${jobsPath}...`);

    for (let i = 0; i < jobs.length; i++) {
      // Create new assistant for each job
      const assistant = Manager.Assistant();

      // Load job
      const job = jobs[i];
      const jobName = job.replace('.js', '');

      // Set log prefix
      assistant.setLogPrefix(`cron/daily/${jobName}()`);

      // Log
      assistant.log(`Starting...`);

      // Load job
      const Job = require(`${jobsPath}/${job}`);
      const jobInstance = new Job();

      // Setup
      jobInstance.Manager = Manager;
      jobInstance.assistant = assistant;
      jobInstance.context = context;
      jobInstance.libraries = Manager.libraries;

      // Execute job
      await jobInstance.main(assistant, context)
        .then(res => {
          assistant.log(`Completed!`);
        })
        .catch(e => {
          assistant.errorify(`Error executing: ${e}`, {
            code: 500,
            sentry: true
          });
          caught = e;
        })
    }

    // If there was an error, reject
    if (caught) {
      return reject(caught);
    }

    // Return
    return resolve();
  });
}

module.exports = Module;
