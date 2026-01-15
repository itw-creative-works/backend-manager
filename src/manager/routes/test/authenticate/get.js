module.exports = async (assistant) => {
  const user = assistant.usage.user;

  // Log user info
  assistant.log('User:', user);

  // Return user info
  return assistant.respond({ user });
};
