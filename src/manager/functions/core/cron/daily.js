const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant()

  self.context = data.context;
  return self;
}

Module.prototype.main = function() {
  const self = this;
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    assistant.log(`cron/daily(): Starting...`);

    const jobsPath = `${__dirname}/daily`;
    const jobs = jetpack.list(jobsPath);
    let caught;

    // For of loop for jobs, load the job, execute it, and log the result
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const jobName = job.replace('.js', '');

      // Log
      assistant.log(`cron/daily(): Job ${jobName} starting...`);

      // Load the job
      const Job = require(`${jobsPath}/${job}`);
      const jobInstance = new Job();
      jobInstance.init(Manager, { context: context, });

      // Execute the job
      await jobInstance.main()
      .then(res => {
        assistant.log(`cron/daily(): Job ${jobName} completed...`);
      })
      .catch(e => {
        assistant.errorManager(`Error executing ${jobName}: ${e}`, {sentry: true, send: false, log: true});
        caught = e;
      })
    }

    if (caught) {
      return reject(caught);
    }

    // Return
    return resolve();
  });
}

module.exports = Module;
