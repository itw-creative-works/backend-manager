module.exports = async ({ assistant, Manager }) => {

  // Get url
  const url = Manager.config?.brand?.url;

  // Log
  assistant.log('Route.main(): Executing route logic', url);

  // Redirect to brand URL
  return assistant.redirect(url);
};
