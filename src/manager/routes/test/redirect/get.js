module.exports = async ({ assistant, settings }) => {

  // Get URL from settings (defaults to itwcreativeworks.com)
  const url = settings.url;

  assistant.log('Redirecting', url);

  return assistant.redirect(url);
};
