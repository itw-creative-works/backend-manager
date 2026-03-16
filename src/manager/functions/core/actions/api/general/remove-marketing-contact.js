function Module() {}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const requestPayload = payload.data.payload || {};

    // Initialize Usage to check auth level
    const usage = await Manager.Usage().init(assistant, {
      unauthenticatedMode: 'firestore',
    });
    const isAdmin = usage.user.roles?.admin || payload.user?.roles?.admin;

    // Admin only endpoint
    if (!isAdmin) {
      return reject(assistant.errorify('Admin access required', { code: 403 }));
    }

    // Extract parameters
    const email = (requestPayload.email || '').trim().toLowerCase();
    const providers = requestPayload.providers || ['sendgrid', 'beehiiv'];

    // Validate email is provided
    if (!email) {
      return reject(assistant.errorify('Email is required', { code: 400 }));
    }

    // Remove from providers
    const mailer = Manager.Email(assistant);
    const providerResults = await mailer.remove(email, { providers });

    // Log result
    assistant.log('remove-marketing-contact result:', {
      email,
      providers: providerResults,
    });

    return resolve({
      data: {
        success: true,
        providers: providerResults,
      },
    });
  });
};

module.exports = Module;
