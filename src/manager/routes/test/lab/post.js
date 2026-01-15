module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

  // Check admin
  if (!user.roles.admin) {
    assistant.log('User is not admin');
  }

  // Example: Send notification (demonstrates calling another BEM endpoint)
  const url = 'https://itwcreativeworks.com';
  const title = 'https://itwcreativeworks.com';
  const icon = 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/socials/itw-creative-works-brandmark-square-black-1024x1024.png?cb=1651834176';

  // For now, just return success - the lab is a testing sandbox
  assistant.log('Lab test executed', { url, title, icon });

  return assistant.respond({ success: true });
};
