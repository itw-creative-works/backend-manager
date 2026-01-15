module.exports = async ({ assistant, user }) => {

  // Log user info
  assistant.log('User:', user);

  // Return user info
  return assistant.respond({ user });
};
