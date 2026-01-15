const ERROR_TOO_MANY_ATTEMPTS = 'You have created too many accounts with our service. Please try again later.';
const MAX_SIGNUPS_PER_DAY = 3;

function Module() {
  const self = this;
}

Module.prototype.init = function (Manager, payload) {
  const self = this;
  self.Manager = Manager;
  self.assistant = Manager.Assistant();
  self.libraries = Manager.libraries;
  self.user = payload.user;
  self.context = payload.context;

  return self;
};

/**
 * beforeUserCreated - IP Rate Limiting ONLY
 *
 * This function ONLY handles IP rate limiting to prevent abuse.
 * User doc creation is handled by on-create.js (which fires for all user creations including Admin SDK).
 *
 * Why not create user doc here?
 * - Admin SDK (used for tests) does NOT trigger beforeUserCreated
 * - on-create fires for ALL user creations, making it more reliable
 */
Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const user = self.user;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    const startTime = Date.now();
    const { functions } = self.libraries;

    const ipAddress = context.ipAddress || '';

    assistant.log(`beforeCreate: ${user.uid}`, { email: user.email, ip: ipAddress });

    // Skip rate limiting if no IP (shouldn't happen in production)
    if (!ipAddress) {
      assistant.log(`beforeCreate: No IP address, skipping rate limit check (${Date.now() - startTime}ms)`);
      return resolve(self);
    }

    // IP Rate Limiting using Usage system
    const usage = await Manager.Usage().init(assistant, {
      key: ipAddress,
      log: true,
    });

    const signups = usage.getUsage('signups');

    assistant.log(`beforeCreate: Rate limit check for ${ipAddress}: ${signups}/${MAX_SIGNUPS_PER_DAY}`);

    // Block if too many signups from this IP
    if (signups >= MAX_SIGNUPS_PER_DAY) {
      assistant.error(`beforeCreate: Too many signups from ${ipAddress} (${signups}/${MAX_SIGNUPS_PER_DAY})`);

      throw new functions.auth.HttpsError('resource-exhausted', ERROR_TOO_MANY_ATTEMPTS);
    }

    // Increment rate limit counter
    usage.increment('signups');
    await usage.update();

    assistant.log(`beforeCreate: Rate limit passed for ${ipAddress}, allowing user creation (${Date.now() - startTime}ms)`);

    // Allow user creation to proceed
    // User doc will be created by on-create.js
    return resolve(self);
  });
};

module.exports = Module;
